import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildPromoterROI } from '@/lib/providers/kimi';
import { ProviderError } from '@/lib/providers/http';
import { getArtistInsights, resolveTagIds } from '@/lib/providers/qloo';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { providerStatus } from '@/lib/demoServer';
import { searchHistoricalContext } from '@/lib/providers/tavily';
import { isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { getAnalysisModelCacheIdentity } from '@/lib/providers/modelConfig';
import { hasEventPlanningInput } from '@/lib/eventPlanning';
import {
  claimSimulationCache,
  completeSimulationCache,
  createSimulationCacheIdentity,
  releaseSimulationClaim,
  type SimulationCacheClaim,
} from '@/lib/supabase/analysisControls';
import { eventPlanSchema, promoterLocationSchema, promoterROIDataSchema } from '@/types/shadowpersona';

export const maxDuration = 300;

const requestSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  location: promoterLocationSchema,
  eventPlan: eventPlanSchema.optional(),
  enableWebResearch: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid promoter analysis input.', details: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.eventPlan && hasEventPlanningInput(parsed.data.eventPlan)) {
    return NextResponse.json(
      { error: 'Model-generated pricing projections are disabled for organizer plans. Enter assumptions and use the deterministic event forecast.' },
      { status: 422 },
    );
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
  const providers = providerStatus();
  const tavilySearchEnabled = parsed.data.enableWebResearch && providers.tavily;
  if (!providers.analysisModel) {
    return NextResponse.json({ error: `${providers.analysisProvider} is not configured on the server.` }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const demoSessionHeader = request.headers.get('x-demo-session-id');
  if (!user && !demoSessionHeader) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }

  const ownerId = user?.id ?? demoSessionHeader;
  if (!ownerId) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }
  const cacheIdentity = createSimulationCacheIdentity(ownerId, {
    version: 5,
    tags: parsed.data.tags.map((tag) => tag.trim().toLowerCase()).sort(),
    location: parsed.data.location,
    eventPlan: parsed.data.eventPlan ?? null,
    analysisModel: getAnalysisModelCacheIdentity(),
    tavilyEnabled: tavilySearchEnabled,
  });
  let activeCacheClaim: SimulationCacheClaim | undefined;
  let cacheStored = false;

  try {
    const cacheClaim = await claimSimulationCache(cacheIdentity);
    if (cacheClaim.outcome === 'cached') {
      const cachedResult = promoterROIDataSchema.safeParse(cacheClaim.response);
      if (!cachedResult.success) {
        console.error('Cached promoter ROI response failed schema validation.');
        throw new ProviderError('Simulation cache', 502, 'Cached promoter data is invalid. Start a new run.');
      }
      return NextResponse.json(cachedResult.data, { headers: { 'x-analysis-cache': 'hit' } });
    }
    if (cacheClaim.outcome === 'in_progress') {
      return NextResponse.json(
        { error: 'An identical promoter analysis is already running. Wait for it to finish before retrying.' },
        { status: 409, headers: { 'Retry-After': String(cacheClaim.retryAfterSeconds) } },
      );
    }
    activeCacheClaim = cacheIdentity;

    const resolved = await resolveTagIds(parsed.data.tags);
    if (resolved.length === 0) {
      return NextResponse.json({ error: 'None of the descriptors matched a Qloo tag.' }, { status: 422 });
    }

    const tags = resolved.map((tag) => tag.name);
    const evidence = await getArtistInsights(resolved.map((tag) => tag.id));
    if (evidence.length === 0) {
      return NextResponse.json({ error: 'Qloo returned no matches for these descriptors.' }, { status: 422 });
    }

    let historical: Awaited<ReturnType<typeof searchHistoricalContext>> = {
      sources: [],
      benchmarks: [],
      compacted: '',
      query: null,
    };
    let comparisonStatus: 'complete' | 'failed' | 'skipped' = 'skipped';
    if (tavilySearchEnabled) {
      try {
        historical = await searchHistoricalContext(tags, parsed.data.location, parsed.data.eventPlan);
        comparisonStatus = historical.compacted ? 'complete' : 'skipped';
      } catch (error) {
        comparisonStatus = 'failed';
        console.error('Local-market search failed', error instanceof Error ? error.message : 'unknown error');
      }
    }
    const result = promoterROIDataSchema.parse(await buildPromoterROI({
      location: parsed.data.location,
      tags,
      evidence,
      historicalContext: historical.compacted,
      benchmarks: historical.benchmarks,
      comparisonStatus,
      eventPlan: parsed.data.eventPlan,
    }));
    if (comparisonStatus !== 'failed' && activeCacheClaim) {
      try {
        cacheStored = await completeSimulationCache(activeCacheClaim, result);
        if (!cacheStored) console.error('Promoter ROI result was not cached because its claim expired.');
      } catch (cacheError) {
        console.error('Could not cache successful promoter ROI analysis.', cacheError instanceof Error ? cacheError.message : 'unknown error');
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.status === 429 || error.status === 422 ? error.status : error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Promoter ROI refresh failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'The promoter ROI analysis could not be refreshed.' }, { status: 500 });
  } finally {
    if (activeCacheClaim && !cacheStored) await releaseSimulationClaim(activeCacheClaim);
  }
}
