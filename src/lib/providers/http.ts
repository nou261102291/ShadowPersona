export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
    public options: { hardQuota?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
  }
}

const retryable = new Set([500, 502, 503, 504]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRetryAfterMs(response: Response, payload: unknown): number | undefined {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const timestamp = Date.parse(header);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  }

  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) return undefined;
  for (const detail of payload.error.details) {
    if (!isRecord(detail) || typeof detail.retryDelay !== 'string') continue;
    const match = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay);
    if (match) return Number(match[1]) * 1000;
  }
  return undefined;
}

async function providerErrorDetails(
  provider: string,
  response: Response,
): Promise<{ message: string; hardQuota: boolean; retryAfterMs?: number }> {
  const fallback = `${provider} returned HTTP ${response.status}.`;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { message: fallback, hardQuota: false };
  }

  if (
    !isRecord(payload) ||
    !('error' in payload) ||
    !isRecord(payload.error) ||
    !('message' in payload.error) ||
    typeof payload.error.message !== 'string'
  ) {
    return { message: fallback, hardQuota: false };
  }

  const detail = payload.error.message
    .replace(/\s+/g, ' ')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[redacted]')
    .trim()
    .slice(0, 500);
  const retryAfterMs = getRetryAfterMs(response, payload);
  if (response.status === 429) {
    const metric = /quota exceeded for metric:\s*([a-zA-Z0-9._/-]+)/i.exec(detail)?.[1];
    const hardQuota = /you exceeded your current quota|billing details/i.test(detail) && retryAfterMs === undefined;
    const message = hardQuota
      ? `${provider} quota is exhausted${metric ? ` (${metric})` : ''}. Check plan and billing.`
      : `${provider} rate limit reached. Wait briefly, then retry.`;
    return { message, hardQuota, retryAfterMs };
  }

  return {
    message: detail ? `${provider} returned HTTP ${response.status}: ${detail.slice(0, 160)}` : fallback,
    hardQuota: false,
  };
}

// Retries transient provider failures with exponential backoff.
export async function fetchWithBackoff(
  provider: string,
  url: string,
  init: RequestInit,
  {
    retries = 3,
    baseDelayMs = 1000,
    timeoutMs = 60_000,
    acquireRequest,
  }: {
    retries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    acquireRequest?: () => Promise<() => Promise<void>>;
  } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    const releaseRequest = acquireRequest ? await acquireRequest() : undefined;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      if (attempt >= retries) throw new ProviderError(provider, 504, `${provider} request failed or timed out.`);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs));
      continue;
    } finally {
      await releaseRequest?.();
    }
    if (response.ok) return response;
    if (response.status === 429) {
      const details = await providerErrorDetails(provider, response);
      const error = new ProviderError(provider, response.status, details.message, {
        hardQuota: details.hardQuota,
        retryAfterMs: details.retryAfterMs,
      });
      const retryWithProviderDelay =
        !details.hardQuota &&
        details.retryAfterMs !== undefined &&
        details.retryAfterMs <= 30_000 &&
        attempt < Math.min(retries, 1);
      if (!retryWithProviderDelay) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, details.retryAfterMs! + Math.random() * Math.min(baseDelayMs, 500)),
      );
      continue;
    }
    if (!retryable.has(response.status) || attempt >= retries) {
      const details = await providerErrorDetails(provider, response);
      throw new ProviderError(provider, response.status, details.message);
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs));
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('replace-')) {
    throw new ProviderError(name, 503, `${name} is not configured on the server.`);
  }
  return value;
}
