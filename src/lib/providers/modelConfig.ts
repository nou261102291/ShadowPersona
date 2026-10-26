import { ProviderError, requireEnv } from './http';

const kimiBaseUrl = 'https://api.moonshot.ai/v1';
const kimiModel = 'kimi-k2.6' as const;

export interface AnalysisModelConfig {
  provider: 'kimi';
  model: typeof kimiModel;
  baseUrl: typeof kimiBaseUrl;
  apiKey: string;
}

export function getAnalysisModelConfig(): AnalysisModelConfig {
  const provider = process.env.AI_PROVIDER ?? 'kimi';
  if (provider !== 'kimi') {
    throw new ProviderError('Kimi', 503, 'AI_PROVIDER must be "kimi".');
  }
  const model = process.env.KIMI_MODEL_ID ?? kimiModel;
  if (model !== kimiModel) {
    throw new ProviderError('Kimi', 503, `KIMI_MODEL_ID must be "${kimiModel}".`);
  }

  return {
    provider,
    model,
    baseUrl: kimiBaseUrl,
    apiKey: requireEnv('KIMI_API_KEY'),
  };
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
  return 'Kimi';
}

export function getAnalysisModelCacheIdentity() {
  const config = getAnalysisModelConfig();
  return { provider: config.provider, model: config.model };
}
