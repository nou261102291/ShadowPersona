import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ProviderError } from '@/lib/providers/http';
import { createAdminClient, isSupabaseAdminConfigured } from './admin';

const claimSchema = z.array(z.object({
  outcome: z.enum(['claimed', 'cached', 'in_progress']),
  cached_response: z.unknown().nullable(),
  retry_after_seconds: z.number().int().nonnegative(),
}));

const leaseSchema = z.array(z.object({
  acquired: z.boolean(),
  lease_id: z.string().uuid().nullable(),
  retry_after_ms: z.number().int().nonnegative(),
}));

const maxGeminiConcurrentRequests = 2;
const maxGeminiQueueWaitMs = 45_000;
const leasePollMaxMs = 2_000;
const geminiLeaseSeconds = 90;
const simulationCacheTtlSeconds = 6 * 60 * 60;

export interface SimulationCacheClaim {
  cacheKey: string;
  ownerKey: string;
}

export async function isGeminiControlsReady(): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  const requestsPerMinute = Number(process.env.GEMINI_REQUESTS_PER_MINUTE ?? '10');
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 120) {
    console.error('Gemini quota controls are not ready: GEMINI_REQUESTS_PER_MINUTE is outside 1-120.');
    return false;
  }
  try {
    const { data, error } = await createAdminClient().rpc('shadowpersona_gemini_controls_ready');
    if (error) {
      console.error('Gemini quota controls are not ready.', error.message);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error('Gemini quota controls health check failed.', error instanceof Error ? error.message : 'unknown error');
    return false;
  }
}

export function createSimulationCacheIdentity(ownerId: string, input: unknown): SimulationCacheClaim {
  const ownerKey = createHash('sha256').update(ownerId).digest('hex');
  const cacheKey = createHash('sha256')
    .update(JSON.stringify({ version: 1, ownerKey, input }))
    .digest('hex');
  return { cacheKey, ownerKey };
}

function controlError(operation: string, detail: string): ProviderError {
  console.error(`Supabase Gemini control failed (${operation}).`, detail);
  return new ProviderError(
    'Gemini',
    503,
    'Shared Gemini quota controls are unavailable. Apply the latest Supabase migration and verify the server role key.',
  );
}

export async function claimSimulationCache(
  claim: SimulationCacheClaim,
): Promise<
  | { outcome: 'claimed' }
  | { outcome: 'cached'; response: unknown }
  | { outcome: 'in_progress'; retryAfterSeconds: number }
> {
  const { data, error } = await createAdminClient().rpc('claim_shadowpersona_simulation', {
    p_cache_key: claim.cacheKey,
    p_owner_key: claim.ownerKey,
    p_claim_seconds: 600,
  });
  if (error) throw controlError('claim simulation', error.message);

  const parsed = claimSchema.safeParse(data);
  if (!parsed.success || !parsed.data[0]) {
    throw controlError('claim simulation response', 'Unexpected database response.');
  }
  const result = parsed.data[0];
  if (result.outcome === 'cached') {
    return { outcome: 'cached', response: result.cached_response };
  }
  if (result.outcome === 'in_progress') {
    return { outcome: 'in_progress', retryAfterSeconds: result.retry_after_seconds };
  }
  return { outcome: 'claimed' };
}

export async function completeSimulationCache(
  claim: SimulationCacheClaim,
  response: unknown,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('complete_shadowpersona_simulation', {
    p_cache_key: claim.cacheKey,
    p_owner_key: claim.ownerKey,
    p_response: response,
    p_ttl_seconds: simulationCacheTtlSeconds,
  });
  if (error) throw controlError('cache simulation result', error.message);
  if (typeof data !== 'boolean') {
    throw controlError('cache simulation result response', 'Unexpected database response.');
  }
  return data;
}

export async function releaseSimulationClaim(claim: SimulationCacheClaim): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('release_shadowpersona_simulation', {
      p_cache_key: claim.cacheKey,
      p_owner_key: claim.ownerKey,
    });
    if (error) console.error('Could not release simulation claim.', error.message);
  } catch (error) {
    console.error('Could not release simulation claim.', error instanceof Error ? error.message : 'unknown error');
  }
}

export async function acquireGeminiLease(): Promise<() => Promise<void>> {
  const requestsPerMinute = Number(process.env.GEMINI_REQUESTS_PER_MINUTE ?? '10');
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 120) {
    throw new ProviderError('Gemini', 503, 'GEMINI_REQUESTS_PER_MINUTE must be an integer from 1 to 120.');
  }

  const startedAt = Date.now();
  let leaseId: string | undefined;
  while (Date.now() - startedAt < maxGeminiQueueWaitMs) {
    const { data, error } = await createAdminClient().rpc('acquire_shadowpersona_gemini_lease', {
      p_max_active: maxGeminiConcurrentRequests,
      p_min_spacing_ms: Math.ceil(60_000 / requestsPerMinute),
      p_lease_seconds: geminiLeaseSeconds,
    });
    if (error) throw controlError('acquire Gemini lease', error.message);

    const parsed = leaseSchema.safeParse(data);
    if (!parsed.success || !parsed.data[0]) {
      throw controlError('acquire Gemini lease response', 'Unexpected database response.');
    }
    const lease = parsed.data[0];
    if (lease.acquired && lease.lease_id) {
      leaseId = lease.lease_id;
      break;
    }

    const pollDelay = Math.min(Math.max(lease.retry_after_ms, 100), leasePollMaxMs);
    const jitter = Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, pollDelay + jitter));
  }

  if (!leaseId) {
    throw new ProviderError('Gemini', 503, 'Gemini is busy processing queued requests. Retry shortly.');
  }

  return async () => {
    try {
      const { error } = await createAdminClient().rpc('release_shadowpersona_gemini_lease', {
        p_lease_id: leaseId,
      });
      if (error) console.error('Could not release Gemini request lease.', error.message);
    } catch (error) {
      console.error('Could not release Gemini request lease.', error instanceof Error ? error.message : 'unknown error');
    }
  };
}
