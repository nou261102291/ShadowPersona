export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const retryable = new Set([429, 500, 502, 503, 504]);

// Retries transient provider failures with exponential backoff.
export async function fetchWithBackoff(
  provider: string,
  url: string,
  init: RequestInit,
  { retries = 3, baseDelayMs = 1000 } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch {
      if (attempt >= retries) throw new ProviderError(provider, 504, `${provider} request failed or timed out.`);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      continue;
    }
    if (response.ok) return response;
    if (!retryable.has(response.status) || attempt >= retries) {
      throw new ProviderError(provider, response.status, `${provider} returned HTTP ${response.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('replace-')) {
    throw new ProviderError(name, 503, `${name} is not configured on the server.`);
  }
  return value;
}
