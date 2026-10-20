import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { extractTags, writeReport } from '@/lib/providers/gemini';
import { ProviderError } from '@/lib/providers/http';
import { getArtistInsights, resolveTagIds } from '@/lib/providers/qloo';
import { providerStatus, readFixture, recordFixture } from '@/lib/demoServer';
import { extractUrl } from '@/lib/providers/tavily';
import { simulationResponseSchema, type ResearchSource } from '@/types/shadowpersona';

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
    if (hasSource && hasUpload) return false;
    return hasSource || hasUpload || hasTags;
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

  // Offline demo: replay a recorded real response when live providers are not configured.
  const providers = providerStatus();
  if (parsed.data.demoScenarioId && !(providers.qloo && providers.gemini)) {
    const fixture = await readFixture(parsed.data.demoScenarioId);
    if (fixture) return NextResponse.json({ ...fixture, mode: 'fixture' });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
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
      });
    }

    const tags = [...new Set([...parsed.data.tags, ...extractedTags].map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
    const resolved = await resolveTagIds(tags);
    if (resolved.length === 0) {
      return NextResponse.json({ error: 'None of the descriptors matched a Qloo tag. Try different genre or mood tags.' }, { status: 422 });
    }

    const evidence = await getArtistInsights(resolved.map((tag) => tag.id));
    if (evidence.length === 0) {
      return NextResponse.json({ error: 'Qloo returned no matches for these descriptors.' }, { status: 422 });
    }

    const { summary, report } = await writeReport({ tags: resolved.map((tag) => tag.name), evidence, webText });
    const response = simulationResponseSchema.parse({ summary, evidence, report, sources, mode: 'live' });
    if (parsed.data.demoScenarioId && process.env.RECORD_DEMO_FIXTURES === '1') {
      await recordFixture(parsed.data.demoScenarioId, { ...response, mode: undefined });
    }
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Simulation failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'The simulation could not be completed.' }, { status: 500 });
  } finally {
    if (parsed.data.uploadPath) await bucket.remove([parsed.data.uploadPath]);
  }
}
