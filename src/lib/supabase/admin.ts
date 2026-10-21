import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ProviderError } from '@/lib/providers/http';
import { isSupabaseConfigured } from './config';

let adminClient: SupabaseClient | undefined;

export function isSupabaseAdminConfigured(): boolean {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    isSupabaseConfigured() &&
    Boolean(serviceRoleKey && !serviceRoleKey.startsWith('replace-with'))
  );
}

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  if (!isSupabaseConfigured()) {
    throw new ProviderError('Supabase', 503, 'Supabase is not configured on the server.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || serviceRoleKey.startsWith('replace-with')) {
    throw new ProviderError(
      'Gemini',
      503,
      'The shared Gemini quota guard is not configured. Set the server-only SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
