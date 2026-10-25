import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import {
  claimSimulationCache,
  completeSimulationCache,
  createSimulationCacheIdentity,
  releaseSimulationClaim,
  type SimulationCacheClaim,
} from '@/lib/supabase/geminiControls';
import { createClient } from '@/lib/supabase/server';
import { buildPromoterROI, compareEvent, extractTags, optimizeEvent, writeReport } from '@/lib/providers/gemini';
import { ProviderError } from '@/lib/providers/http';
import { getArtistInsights, getBrandInsights, resolveTagIds } from '@/lib/providers/qloo';
import { providerStatus, readFixture, recordFixture } from '@/lib/demoServer';
import { getAnalysisModelCacheIdentity } from '@/lib/providers/modelConfig';
import { extractUrl, searchHistoricalContext } from '@/lib/providers/tavily';
import { calculateEventForecast, hasEventPlanningInput } from '@/lib/eventPlanning';
import {
  promoterLocationSchema,
  eventPlanSchema,
  simulationResponseSchema,
  type PromoterROIData,
  type ResearchSource,
} from '@/types/shadowpersona';

export const maxDuration = 300;

const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const maxFileBytes = 10 * 1024 * 1024;
const fileSignatures = [
  { extension: 'pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  { extension: 'jpeg', signature: [0xff, 0xd8, 0xff] },
] as const;

const requestSchema = z.object({
  vertical: z.enum(['music', 'hospitality']),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  sourceUrl: z.url().max(2048).optional(),
  uploadPath: z.string().min(1).max(512).optional(),
  originalFileName: z.string().min(1).max(255).optional(),
  demoScenarioId: z.string().regex(/^[a-z0-9-]+$/).max(64).optional(),
  location: promoterLocationSchema.optional(),
  eventPlan: eventPlanSchema.optional(),
  fileData: z
    .object({
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(100),
      base64: z.string().min(1).max(15 * 1024 * 1024),
    })
    .optional(),
}).refine(
  (value) => {
    const hasSource = Boolean(value.sourceUrl);
    const hasUpload = Boolean(value.uploadPath) || Boolean(value.fileData);
    const hasTags = value.tags.length > 0;
    const hasEventContext = [
      value.eventPlan?.featuredTalent,
      value.eventPlan?.hosts,
      value.eventPlan?.tone,
    ].some((part) => Boolean(part?.trim()));
    if (hasSource && hasUpload) return false;
    return hasSource || hasUpload || hasTags || hasEventContext;
  },
  {
    message: 'Provide at least one input: an uploaded brief, a URL, or cultural tags.',
    path: ['sourceUrl'],
  },
);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid simulation input.', details: parsed.error.issues }, { status: 400 });
  }
  const searchLocation = parsed.data.eventPlan
    ? parsed.data.eventPlan.location || undefined
    : parsed.data.location || 'San Francisco, CA';
  const roiLocation = searchLocation ?? 'Location not specified';

  // Offline demo: replay a recorded real response when live providers are not configured.
  const providers = providerStatus();
  const liveReady = providers.qloo && providers.analysisModel && isSupabaseAdminConfigured();
  if (parsed.data.demoScenarioId && !liveReady) {
    const fixture = await readFixture(parsed.data.demoScenarioId);
    if (fixture) return NextResponse.json({ ...fixture, mode: 'fixture' });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: 'Shared analysis controls are not configured. Set the server-only SUPABASE_SERVICE_ROLE_KEY and apply the latest migration.' },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSessionHeader = request.headers.get('x-demo-session-id');
  if (!user && !demoSessionHeader) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }
  const sessionId = user?.id ?? demoSessionHeader!;

  if (parsed.data.uploadPath && !parsed.data.uploadPath.startsWith(`${sessionId}/`)) {
    return NextResponse.json({ error: 'The uploaded asset does not belong to this session.' }, { status: 403 });
  }

  if (parsed.data.vertical !== 'music') {
    return NextResponse.json({ error: 'Hospitality analysis is planned for a later release.' }, { status: 422 });
  }

  const bucket = supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets');
  let upload: { base64: string; mimeType: string } | undefined;
  let activeCacheClaim: SimulationCacheClaim | undefined;
  let cacheStored = false;

  if (parsed.data.fileData) {
    const rawBuffer = Buffer.from(parsed.data.fileData.base64, 'base64');
    if (rawBuffer.byteLength > maxFileBytes) {
      return NextResponse.json({ error: 'Uploaded files must be 10 MB or smaller.' }, { status: 413 });
    }
    const extension = parsed.data.fileData.name.split('.').pop()?.toLowerCase();
    const validSignature = fileSignatures.some(
      (candidate) =>
        candidate.extension === extension &&
        candidate.signature.every((byte, index) => rawBuffer[index] === byte),
    );
    if (!validSignature) {
      return NextResponse.json({ error: 'Uploaded file content does not match a supported PDF, PNG, or JPG format.' }, { status: 415 });
    }
    upload = {
      base64: parsed.data.fileData.base64,
      mimeType: mimeByExtension[extension as string] || parsed.data.fileData.type,
    };
  } else if (parsed.data.uploadPath) {
    const { data: file, error: downloadError } = await bucket.download(parsed.data.uploadPath);
    if (downloadError || !file) {
      return NextResponse.json({ error: 'The temporary upload could not be retrieved.' }, { status: 422 });
    }

    if (file.size > maxFileBytes) {
      await bucket.remove([parsed.data.uploadPath]);
      return NextResponse.json({ error: 'Uploaded files must be 10 MB or smaller.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const extension = parsed.data.originalFileName?.split('.').pop()?.toLowerCase();
    const validSignature = fileSignatures.some(
      (candidate) =>
        candidate.extension === extension &&
        candidate.signature.every((byte, index) => bytes[index] === byte),
    );
    if (!validSignature) {
      await bucket.remove([parsed.data.uploadPath]);
      return NextResponse.json({ error: 'Uploaded file content does not match a supported PDF, PNG, or JPG format.' }, { status: 415 });
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    upload = { base64, mimeType: mimeByExtension[extension as string] || file.type };
  }

  try {
    const fileContentHash = upload
      ? createHash('sha256').update(upload.base64).digest('hex')
      : null;
    const cacheIdentity = createSimulationCacheIdentity(sessionId, {
      version: 7,
      vertical: parsed.data.vertical,
      tags: parsed.data.tags.map((tag) => tag.trim().toLowerCase()).sort(),
      sourceUrl: parsed.data.sourceUrl ?? null,
      fileContentHash,
      location: searchLocation ?? null,
      eventPlan: parsed.data.eventPlan ?? null,
      demoScenarioId: parsed.data.demoScenarioId ?? null,
      analysisModel: getAnalysisModelCacheIdentity(),
      tavilyEnabled: providers.tavily,
    });
    const cacheClaim = await claimSimulationCache(cacheIdentity);
    if (cacheClaim.outcome === 'cached') {
      const cachedResponse = simulationResponseSchema.safeParse(cacheClaim.response);
      if (!cachedResponse.success) {
        console.error('Cached simulation response failed schema validation.');
        throw new ProviderError('Simulation cache', 502, 'Cached analysis data is invalid. Start a new run.');
      }
      return NextResponse.json(
        { ...cachedResponse.data, mode: 'live' },
        { headers: { 'x-shadowpersona-cache': 'hit' } },
      );
    }
    if (cacheClaim.outcome === 'in_progress') {
      return NextResponse.json(
        { error: 'An identical analysis is already running. Wait for it to finish before retrying.' },
        { status: 409, headers: { 'Retry-After': String(cacheClaim.retryAfterSeconds) } },
      );
    }
    activeCacheClaim = cacheIdentity;

    let webText: string | undefined;
    const sources: ResearchSource[] = [];
    if (parsed.data.sourceUrl) {
      const extracted = await extractUrl(parsed.data.sourceUrl);
      if (extracted) {
        webText = extracted.text;
        sources.push(extracted.source);
      }
    }

    let extractedTags: string[] = [];
    if (upload || webText) {
      extractedTags = await extractTags({
        file: upload ? { mimeType: upload.mimeType, base64: upload.base64 } : undefined,
        webText,
        eventPlan: parsed.data.eventPlan,
      });
    }

    const eventDescriptors =
      parsed.data.tags.length === 0
        ? [
            parsed.data.eventPlan?.featuredTalent,
            parsed.data.eventPlan?.hosts,
            parsed.data.eventPlan?.tone,
          ]
            .flatMap((value) => value?.split(/[,;\n]/) ?? [])
            .map((tag) => tag.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 5)
        : [];
    const tags = [...new Set([...parsed.data.tags, ...eventDescriptors, ...extractedTags].map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
    const resolved = await resolveTagIds(tags);
    if (resolved.length === 0) {
      return NextResponse.json({ error: 'None of the descriptors matched a Qloo tag. Try different genre or mood tags.' }, { status: 422 });
    }

    const tagIds = resolved.map((tag) => tag.id);
    const [artistResult, brandResult] = await Promise.allSettled([
      getArtistInsights(tagIds),
      getBrandInsights(tagIds),
    ]);
    if (artistResult.status === 'rejected') throw artistResult.reason;
    const evidence = artistResult.value;
    if (evidence.length === 0) {
      return NextResponse.json({ error: 'Qloo returned no matches for these descriptors.' }, { status: 422 });
    }
    const brandEvidenceStatus =
      brandResult.status === 'rejected'
        ? 'failed'
        : brandResult.value.length > 0
          ? 'complete'
          : 'empty';
    const brandEvidence = brandResult.status === 'fulfilled' ? brandResult.value : [];
    if (brandResult.status === 'rejected') {
      console.error(
        'Qloo brand insights were unavailable',
        brandResult.reason instanceof Error ? brandResult.reason.message : 'unknown error',
      );
    }

    const resolvedNames = resolved.map((tag) => tag.name);
    const emptyHistorical: Awaited<ReturnType<typeof searchHistoricalContext>> = {
      sources: [],
      benchmarks: [],
      compacted: '',
      query: null,
    };
    const historicalPromise = providerStatus().tavily
      ? searchHistoricalContext(resolvedNames, searchLocation, parsed.data.eventPlan)
      : Promise.resolve(emptyHistorical);
    const [reportResult, historicalResult] = await Promise.allSettled([
      writeReport({ tags: resolvedNames, evidence, eventPlan: parsed.data.eventPlan }),
      historicalPromise,
    ]);
    if (reportResult.status === 'rejected') throw reportResult.reason;
    const { summary, report } = reportResult.value;

    // Best-effort market research runs alongside report generation.
    let historical: Awaited<ReturnType<typeof searchHistoricalContext>> = emptyHistorical;
    let comparisonStatus: 'complete' | 'skipped' | 'failed' = 'skipped';
    if (historicalResult.status === 'fulfilled') {
      historical = historicalResult.value;
      console.info(`Historical search: query=${historical.query ?? 'none'} chars=${historical.compacted.length}`);
      sources.push(...historical.sources);
      comparisonStatus = historical.compacted ? 'complete' : 'skipped';
    } else {
      comparisonStatus = 'failed';
      console.error(
        'Historical search failed',
        historicalResult.reason instanceof Error ? historicalResult.reason.message : 'unknown error',
      );
    }

    const shouldGeneratePromoterROI = !parsed.data.eventPlan || !hasEventPlanningInput(parsed.data.eventPlan);
    const shouldGenerateComparison =
      comparisonStatus === 'complete' &&
      (!parsed.data.eventPlan || !hasEventPlanningInput(parsed.data.eventPlan));
    const [comparisonResult, optimizationResult, promoterROIResult] = await Promise.allSettled([
      shouldGenerateComparison
        ? compareEvent({
            tags: resolvedNames,
            evidence,
            historicalContext: historical.compacted,
            briefText: webText,
            eventPlan: parsed.data.eventPlan,
          })
        : Promise.resolve(undefined),
      optimizeEvent({ tags: resolvedNames, evidence, historicalContext: historical.compacted, eventPlan: parsed.data.eventPlan }),
      shouldGeneratePromoterROI
        ? buildPromoterROI({
            location: roiLocation,
            tags: resolvedNames,
            evidence,
            historicalContext: historical.compacted,
            benchmarks: historical.benchmarks,
            comparisonStatus,
            eventPlan: parsed.data.eventPlan,
          })
        : Promise.resolve(undefined),
    ]);

    let comparison;
    if (comparisonResult.status === 'fulfilled') {
      comparison = comparisonResult.value;
    } else {
      comparisonStatus = 'failed';
      console.error('Comparative analysis failed', comparisonResult.reason instanceof Error ? comparisonResult.reason.message : 'unknown error');
    }

    let optimization;
    if (optimizationResult.status === 'fulfilled') {
      optimization = { ...optimizationResult.value, competitiveBenchmarks: historical.benchmarks, comparisonStatus };
    } else {
      console.error('Optimization failed', optimizationResult.reason instanceof Error ? optimizationResult.reason.message : 'unknown error');
    }

    let promoterROI: PromoterROIData | undefined;
    let promoterROIStatus: 'complete' | 'failed' | 'skipped' = 'skipped';
    if (shouldGeneratePromoterROI) {
      if (promoterROIResult.status === 'fulfilled' && promoterROIResult.value) {
        promoterROI = promoterROIResult.value;
        promoterROIStatus = 'complete';
      } else if (promoterROIResult.status === 'rejected') {
        promoterROIStatus = 'failed';
        console.error(
          'Promoter ROI analysis failed',
          promoterROIResult.reason instanceof Error ? promoterROIResult.reason.message : 'unknown error',
        );
      }
    }

    const response = simulationResponseSchema.parse({
      summary,
      evidence,
      brandEvidence,
      brandEvidenceStatus,
      report,
      sources,
      resolvedTags: resolved.map((tag) => tag.name),
      comparison,
      comparisonStatus: comparison
        ? 'complete'
        : shouldGenerateComparison && comparisonStatus === 'failed'
          ? 'failed'
          : 'skipped',
      optimization,
      promoterROI,
      promoterROIStatus,
      eventForecast: parsed.data.eventPlan
        ? calculateEventForecast(parsed.data.eventPlan)
        : undefined,
      mode: 'live',
    });
    if (parsed.data.demoScenarioId && process.env.RECORD_DEMO_FIXTURES === '1') {
      await recordFixture(parsed.data.demoScenarioId, { ...response, mode: undefined });
    }
    const completeRun =
      response.promoterROIStatus !== 'failed' &&
      response.optimization !== undefined &&
      response.comparisonStatus !== 'failed';
    if (activeCacheClaim && completeRun) {
      try {
        cacheStored = await completeSimulationCache(activeCacheClaim, response);
        if (!cacheStored) console.error('Simulation result was not cached because its claim expired.');
      } catch (cacheError) {
        console.error(
          'Could not cache successful simulation.',
          cacheError instanceof Error ? cacheError.message : 'unknown error',
        );
      }
    }
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.status === 429 || error.status === 422 ? error.status : error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Simulation failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'The simulation could not be completed.' }, { status: 500 });
  } finally {
    if (activeCacheClaim && !cacheStored) await releaseSimulationClaim(activeCacheClaim);
    if (parsed.data.uploadPath) await bucket.remove([parsed.data.uploadPath]);
  }
}
