import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { isGeminiControlsReady } from '@/lib/supabase/geminiControls';
import { listFixtureIds, providerStatus } from '@/lib/demoServer';

export const dynamic = 'force-dynamic';

// Reports only whether each integration is configured; never any key values.
export async function GET() {
  const providers = providerStatus();
  const analysisControls = await isGeminiControlsReady();
  return NextResponse.json({
    supabase: isSupabaseConfigured(),
    analysisControls,
    ...providers,
    live: providers.qloo && providers.analysisModel && analysisControls,
    fixtures: await listFixtureIds(),
  });
}
