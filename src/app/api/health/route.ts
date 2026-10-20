import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listFixtureIds, providerStatus } from '@/lib/demoServer';

export const dynamic = 'force-dynamic';

// Reports only whether each integration is configured; never any key values.
export async function GET() {
  const providers = providerStatus();
  return NextResponse.json({
    supabase: isSupabaseConfigured(),
    ...providers,
    live: providers.qloo && providers.gemini,
    fixtures: await listFixtureIds(),
  });
}
