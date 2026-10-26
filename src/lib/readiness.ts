export interface HealthStatus {
  supabase: boolean;
  qloo: boolean;
  analysisModel: boolean;
  analysisProvider: string;
  analysisControls: boolean;
  tavily: boolean;
  live: boolean;
  fixtures: string[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  fix?: string;
}

export interface ReadinessInput {
  hasFile: boolean;
  fileError: string | null;
  tags: string;
  sourceUrl: string;
  hasEventContext: boolean;
  demoScenarioId: string | null;
  health: HealthStatus | null;
}

export function canReplayDemo(demoScenarioId: string | null, health: HealthStatus | null): boolean {
  return Boolean(demoScenarioId && health && !health.live && health.fixtures.includes(demoScenarioId));
}

export function getReadiness(input: ReadinessInput): ReadinessItem[] {
  const url = input.sourceUrl.trim();
  const hasTags = input.tags.split(/[,;\n]/).some((tag) => tag.trim());
  const items: ReadinessItem[] = [
    {
      id: 'input',
      label: 'Something to analyze',
      ok: input.hasFile || Boolean(url) || hasTags || input.hasEventContext,
      fix: 'Load the demo data, upload a brief, paste a URL, add a few tags, or enter event talent, host, or tone.',
    },
  ];

  if (input.hasFile && url) {
    items.push({ id: 'conflict', label: 'One source at a time', ok: false, fix: 'Remove the file or clear the URL.' });
  }
  if (input.fileError) {
    items.push({ id: 'file', label: 'File is valid', ok: false, fix: input.fileError });
  }
  if (url) {
    let valid = true;
    try {
      valid = ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      valid = false;
    }
    items.push({ id: 'url', label: 'URL is valid', ok: valid, fix: 'Enter a full http(s) address.' });
  }

  if (!input.health) {
    items.push({ id: 'services', label: 'Checking services…', ok: false });
  } else if (canReplayDemo(input.demoScenarioId, input.health)) {
    items.push({ id: 'services', label: 'Offline demo: replaying a recorded result', ok: true });
  } else {
    const missing = [
      !input.health.supabase && 'Supabase',
      !input.health.qloo && 'Qloo',
      !input.health.analysisModel && input.health.analysisProvider,
      !input.health.analysisControls && 'Shared analysis controls',
      Boolean(url) && !input.health.tavily && 'Tavily',
    ].filter(Boolean);
    items.push({
      id: 'services',
      label: missing.length ? `Setup needed: ${missing.join(', ')}` : 'Analysis services connected',
      ok: missing.length === 0,
      fix: 'Set the server keys in .env.local and apply the latest Supabase migration (see .env.example).',
    });
  }
  return items;
}
