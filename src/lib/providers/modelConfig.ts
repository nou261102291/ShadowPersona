import { ProviderError, requireEnv } from './http';

export type AnalysisModelConfig =
  | { provider: 'gemini'; model: string; fallbackModel?: string }
  | { provider: 'lm-studio'; model: string; baseUrl: string; apiKey?: string };

export function getAnalysisModelConfig(): AnalysisModelConfig {
  const provider = process.env.AI_PROVIDER ?? 'gemini';
  if (provider === 'gemini') {
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL_ID;
    return {
      provider,
      model: requireEnv('GEMINI_MODEL_ID'),
      fallbackModel: fallbackModel && !fallbackModel.startsWith('replace-') ? fallbackModel : undefined,
    };
  }

  if (provider === 'lm-studio') {
    const configuredBaseUrl = requireEnv('LM_STUDIO_BASE_URL').replace(/\/+$/, '');
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new ProviderError('OpenAI-compatible model', 503, 'LM_STUDIO_BASE_URL must be a valid HTTP(S) URL.');
    }
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new ProviderError('OpenAI-compatible model', 503, 'LM_STUDIO_BASE_URL must use HTTP or HTTPS.');
    }
    if (parsedBaseUrl.search || parsedBaseUrl.hash) {
      throw new ProviderError(
        'OpenAI-compatible model',
        503,
        'LM_STUDIO_BASE_URL must not include a query string or fragment.',
      );
    }
    const baseUrl = /\/v1$/i.test(parsedBaseUrl.pathname)
      ? configuredBaseUrl
      : `${configuredBaseUrl}/v1`;

    const apiKey = process.env.LM_STUDIO_API_KEY;
    return {
      provider,
      model: requireEnv('LM_STUDIO_MODEL_ID'),
      baseUrl,
      apiKey: apiKey && !apiKey.startsWith('replace-') ? apiKey : undefined,
    };
  }

  throw new ProviderError('Analysis model', 503, 'AI_PROVIDER must be either "gemini" or "lm-studio".');
}

export function isAnalysisModelConfigured(): boolean {
  try {
    getAnalysisModelConfig();
    return true;
  } catch (error) {
    if (error instanceof ProviderError && error.status === 503) return false;
    throw error;
  }
}

export function getAnalysisModelProviderLabel(): string {
  if (process.env.AI_PROVIDER === 'lm-studio') return 'OpenAI-compatible model';
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'gemini') return 'Unsupported AI provider';
  return 'Gemini';
}

export function getAnalysisModelCacheIdentity() {
  const config = getAnalysisModelConfig();
  if (config.provider === 'lm-studio') {
    return { provider: config.provider, model: config.model, baseUrl: config.baseUrl };
  }
  return { provider: config.provider, model: config.model, fallbackModel: config.fallbackModel ?? null };
}
