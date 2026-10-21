import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildPromoterROI } from '@/lib/providers/gemini';
import { ProviderError } from '@/lib/providers/http';
import { getArtistInsights, resolveTagIds } from '@/lib/providers/qloo';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { providerStatus } from '@/lib/demoServer';
import { searchHistoricalContext } from '@/lib/providers/tavily';
import { promoterLocationSchema, promoterROIDataSchema } from '@/types/shadowpersona';

export const maxDuration = 300;

const requestSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  location: promoterLocationSchema,
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

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !request.headers.get('x-demo-session-id')) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }

  try {
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
    if (providerStatus().tavily) {
      try {
        historical = await searchHistoricalContext(tags, parsed.data.location);
        comparisonStatus = historical.compacted ? 'complete' : 'skipped';
      } catch (error) {
        comparisonStatus = 'failed';
        console.error('Local-market search failed', error instanceof Error ? error.message : 'unknown error');
      }
    }
    const result = await buildPromoterROI({
      location: parsed.data.location,
      tags,
      evidence,
      historicalContext: historical.compacted,
      benchmarks: historical.benchmarks,
      comparisonStatus,
    });
    return NextResponse.json(promoterROIDataSchema.parse(result));
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Promoter ROI refresh failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'The promoter ROI analysis could not be refreshed.' }, { status: 500 });
  }
}
