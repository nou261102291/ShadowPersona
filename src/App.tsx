'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { DEMO_SCENARIOS, type DemoScenario } from './lib/demoScenarios';
import { canReplayDemo, getReadiness, type HealthStatus, type ReadinessItem } from './lib/readiness';
import { createClient } from './lib/supabase/client';
import { isSupabaseConfigured } from './lib/supabase/config';
import OptimizationSuite from './components/OptimizationSuite';
import PromoterROIConsole from './components/PromoterROIConsole';
import PromoterROIUnavailable from './components/PromoterROIUnavailable';
import EventForecastPanel from './components/EventForecastPanel';
import EventPlanInputs from './components/EventPlanInputs';
import { hasEventPlanningInput } from './lib/eventPlanning';
import { eventPlanSchema, simulationResponseSchema } from './types/shadowpersona';
import { promoterROIDataSchema } from './types/shadowpersona';
import type { ComparativeAnalysis, EventPlan, PromoterLocation, SimulationResponse, TargetVertical } from './types/shadowpersona';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);

type PipelineStage = 'idle' | 'uploading' | 'mapping' | 'analyzing';

const SUGGESTED_TAGS = [
  'Jazz Fusion',
  'Indie Rock',
  'Neo-Soul',
  'Lo-Fi',
  'Dream Pop',
  'Ambient',
  'Synthwave',
  'Acoustic Folk',
  'Electronic',
  'Chill Vibes',
];

function fileIsSupported(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTENSIONS.has(extension);
}

function getFileError(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return 'Choose a file smaller than 10 MB.';
  if (!fileIsSupported(file)) return 'Supported formats are PDF, PNG, and JPG.';
  return null;
}

function getAnalysisErrorMessage(cause: unknown): string {
  if (cause instanceof TypeError && /failed to fetch|network request failed|load failed/i.test(cause.message)) {
    return 'The analysis service could not be reached. Check your connection and retry; if running locally, make sure the app server is running.';
  }
  return cause instanceof Error ? cause.message : 'The analysis was interrupted by an unexpected error.';
}

async function readApiResponse(response: Response, serviceName: string): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(
        `${serviceName} returned HTTP ${response.status} without a JSON response. The request may have timed out; please retry.`,
      );
    }
    throw new Error(`${serviceName} returned an invalid response. Please retry.`);
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `${serviceName} returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function getDemoSessionId(): string {
  try {
    const stored = window.sessionStorage.getItem('shadowpersona_demo_session');
    if (stored) return stored;
    const sessionId = crypto.randomUUID();
    window.sessionStorage.setItem('shadowpersona_demo_session', sessionId);
    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}

function Icon({
  name,
  className = 'h-4 w-4',
}: {
  name: 'arrow' | 'check' | 'chevron' | 'copy' | 'download' | 'file' | 'search' | 'spark' | 'upload';
  className?: string;
}) {
  const paths = {
    arrow: <path d="m5 12 5 5L20 7M20 7H9m11 0v11" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    copy: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h5M9 13h6M9 17h4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    spark: <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />,
    upload: (
      <>
        <path d="M12 16V4m0 0L7 9m5-5 5 5" />
        <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {paths[name]}
    </svg>
  );
}

function Header({ stage, health }: { stage: PipelineStage; health: HealthStatus | null }) {
  const steps = [
    { label: 'Brief input', active: stage === 'uploading' },
    { label: 'Qloo Taste Graph', active: stage === 'mapping' || stage === 'analyzing' },
    { label: 'Gemini synthesis', active: stage === 'analyzing' },
  ];

  return (
    <header className="relative z-20 flex h-[72px] items-center justify-between border-b border-white/[0.07] bg-[#0d0e12]/90 px-5 backdrop-blur-xl md:px-7">
      <div className="flex min-w-fit items-center gap-3">
        <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-400 shadow-[0_0_24px_rgba(37,99,235,0.2)]">
          <span className="absolute h-4 w-px rotate-45 bg-blue-400/80" />
          <span className="absolute h-4 w-px -rotate-45 bg-blue-400/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_9px_#fff]" />
        </div>
        <div>
          <p className="text-[14px] font-semibold tracking-[-0.02em] text-white">
            ShadowPersona <span className="text-blue-400">AI</span>
          </p>
          <p className="hidden text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:block">
            Qloo-grounded cultural intelligence
          </p>
        </div>
      </div>

      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center lg:flex">
        {steps.map((step, index) => (
          <div className="flex items-center" key={step.label}>
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] font-semibold ${
                  step.active
                    ? 'border-blue-400 bg-blue-500 text-white shadow-[0_0_14px_rgba(37,99,235,0.55)]'
                    : 'border-white/10 bg-white/[0.03] text-slate-600'
                }`}
              >
                {step.active ? <Icon name="spark" className="h-3 w-3" /> : index + 1}
              </span>
              <span className={`text-[11px] font-medium ${step.active ? 'text-slate-200' : 'text-slate-500'}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && <span className="mx-4 h-px w-8 bg-white/10" />}
          </div>
        ))}
      </div>

      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-medium ${
          health?.live
            ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]'
            : 'border-amber-400/20 bg-amber-400/[0.08] text-amber-200'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${health?.live ? 'bg-emerald-400' : 'bg-amber-300'}`} />
        {health ? (health.live ? 'Live analysis ready' : 'Setup required') : 'Checking services…'}
      </div>
    </header>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-400">{eyebrow}</p>
      <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-slate-100">{title}</h2>
    </div>
  );
}

function formatInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function MarkdownReportView({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);

  return (
    <div className="space-y-3.5 text-[11px] leading-relaxed text-slate-300">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="mt-4 mb-1 text-[12px] font-semibold tracking-tight text-blue-300">
              {trimmed.replace(/^###\s+/, '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3
              key={idx}
              className="mt-5 mb-1.5 text-[13px] font-bold tracking-tight text-slate-100 border-b border-white/[0.06] pb-1"
            >
              {trimmed.replace(/^##\s+/, '')}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} className="mt-6 mb-2 text-[14px] font-bold text-white">
              {trimmed.replace(/^#\s+/, '')}
            </h2>
          );
        }

        if (
          trimmed.includes('\n- ') ||
          trimmed.startsWith('- ') ||
          trimmed.includes('\n* ') ||
          trimmed.startsWith('* ')
        ) {
          const items = trimmed
            .split(/\n[*-]\s+/)
            .map((item) => item.replace(/^[*-]\s+/, '').trim())
            .filter(Boolean);

          return (
            <ul key={idx} className="my-2 space-y-1.5 pl-4 list-disc text-slate-300">
              {items.map((item, i) => (
                <li key={i} className="leading-relaxed">
                  {formatInlineText(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="leading-relaxed text-slate-300">
            {formatInlineText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function FileDropzone({
  file,
  onFileChange,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;
    const error = getFileError(candidate);
    setFileError(error);
    if (!error) onFileChange(candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  return (
    <div>
      <div
        className={`group relative mt-3 flex min-h-[136px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-4 text-center transition-all ${
          isDragging
            ? 'border-blue-400 bg-blue-500/10'
            : 'border-white/[0.14] bg-white/[0.018] hover:border-blue-500/50 hover:bg-blue-500/[0.04]'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-transform group-hover:-translate-y-0.5">
          <Icon name={file ? 'file' : 'upload'} className="h-4 w-4" />
        </div>
        <p className="mt-2.5 max-w-full truncate text-[11px] font-medium text-slate-200">
          {file?.name ?? 'Drop a launch brief or artwork'}
        </p>
        <p className="mt-1 text-[9px] text-slate-500">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · removed after processing`
            : 'PDF, PNG or JPG · up to 10 MB'}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
        <a
          href="/api/demo/neo-soul-lofi/file"
          download="sample_music_brief.pdf"
          className="underline decoration-blue-400/30 underline-offset-2 hover:text-blue-300"
        >
          📥 Download sample brief (PDF)
        </a>
        {file && (
          <button
            className="text-slate-400 underline decoration-white/20 underline-offset-2 hover:text-slate-200"
            onClick={() => {
              onFileChange(null);
              setFileError(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            type="button"
          >
            Remove file
          </button>
        )}
      </div>

      {fileError && <p className="mt-2 text-[10px] text-rose-300">{fileError}</p>}
    </div>
  );
}

function InputPanel({
  file,
  onFileChange,
  vertical,
  onVerticalChange,
  tags,
  onTagsChange,
  eventPlan,
  onEventPlanChange,
  sourceUrl,
  onSourceUrlChange,
  webResearchEnabled,
  onWebResearchEnabledChange,
  onRun,
  stage,
  selectedScenarioId,
  onSelectScenario,
  readiness,
  onLoadDemo,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  vertical: TargetVertical;
  onVerticalChange: (vertical: TargetVertical) => void;
  tags: string;
  onTagsChange: (tags: string) => void;
  eventPlan: EventPlan;
  onEventPlanChange: (plan: EventPlan) => void;
  sourceUrl: string;
  onSourceUrlChange: (url: string) => void;
  webResearchEnabled: boolean;
  onWebResearchEnabledChange: (enabled: boolean) => void;
  onRun: () => void;
  stage: PipelineStage;
  selectedScenarioId: string | null;
  onSelectScenario: (scenario: DemoScenario) => void;
  readiness: ReadinessItem[];
  onLoadDemo: (scenario: DemoScenario, run: boolean) => void;
}) {
  const busy = stage !== 'idle';
  const blocked = readiness.some((item) => !item.ok);
  const activeDemo = DEMO_SCENARIOS.find((sc) => sc.id === selectedScenarioId) ?? DEMO_SCENARIOS[0];
  const buttonText =
    stage === 'uploading'
      ? 'Reading your brief...'
      : stage === 'mapping'
        ? 'Mapping audience taste...'
        : stage === 'analyzing'
          ? 'Writing your report...'
          : 'Run event analysis';

  return (
    <section className="flex min-h-0 flex-col border-b border-white/[0.07] bg-[#101116] p-5 lg:border-r lg:border-b-0 xl:p-6 overflow-y-auto">
      <SectionHeading eyebrow="01 · Input framework" title="Launch Brief" />

      {/* Guided Live Demo Scenarios */}
      <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/20 text-[11px] text-blue-300">
              ⚡
            </span>
            <h3 className="text-[11px] font-semibold text-slate-200">Instant Demo Scenarios</h3>
          </div>
          <span className="text-[9px] font-medium text-blue-400">1-Click Test</span>
        </div>
        <p className="mt-1 text-[9px] leading-normal text-slate-400">
          Just testing? Pick a scenario, then fill every field with one click, or fill and run it.
        </p>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onLoadDemo(activeDemo, false)}
            className="h-8 rounded-lg border border-blue-400/40 bg-blue-500/10 text-[10px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
          >
            Fill demo data
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onLoadDemo(activeDemo, true)}
            className="h-8 rounded-lg bg-blue-600 text-[10px] font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            Fill &amp; run demo
          </button>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {DEMO_SCENARIOS.map((sc) => {
            const isSelected = selectedScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectScenario(sc)}
                className={`flex w-full items-center justify-between rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-400/50 bg-blue-500/15 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                    : 'border-white/[0.07] bg-[#14161c] hover:border-white/20 hover:bg-[#181a22]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{sc.icon}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-200">{sc.title}</p>
                    <p className="text-[9px] text-slate-500">{sc.subtitle}</p>
                  </div>
                </div>
                <span
                  className={`text-[9px] font-medium ${
                    isSelected ? 'text-blue-300' : 'text-slate-400 group-hover:text-blue-300'
                  }`}
                >
                  {isSelected ? 'Loaded ✓' : 'Use'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="my-4 flex items-center gap-3 text-[9px] uppercase tracking-widest text-slate-600">
        <span className="h-px flex-1 bg-white/[0.07]" />
        or custom brief / file
        <span className="h-px flex-1 bg-white/[0.07]" />
      </div>

      <FileDropzone file={file} onFileChange={onFileChange} />

      <aside
        aria-label="Privacy and provider data use"
        className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-3"
      >
        <p className="text-[10px] font-semibold text-amber-100">Privacy &amp; data use</p>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
          Qloo receives the cultural tags used for matching, not your uploaded file. Your brief and event details are sent
          to the configured analysis model; if Tavily is enabled, your URL or a search query built from tags and event
          details may also be sent to Tavily. Uploaded files are removed after processing. Avoid sensitive or identifying
          information, or use tags only and leave the brief and URL blank.
        </p>
      </aside>

      <div className="mt-4">
        <span className="mb-1.5 block text-[10px] font-medium text-slate-400">
          Web enrichment URL <span className="font-normal text-slate-600">Optional · sent to Tavily when provided</span>
        </span>
        <input
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#15171d] px-3 text-[11px] text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500/60"
          maxLength={2048}
          type="url"
          value={sourceUrl}
          onChange={(event) => onSourceUrlChange(event.target.value)}
          placeholder="e.g. https://en.wikipedia.org/wiki/Kind_of_Blue"
        />
        <label className="mt-2 flex items-start gap-2 text-[9px] leading-relaxed text-slate-400">
          <input
            checked={webResearchEnabled}
            className="mt-0.5 accent-blue-500"
            onChange={(event) => onWebResearchEnabledChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            Allow optional public market research via Tavily. This sends cultural tags and entered event/location details
            as search terms. Off by default.
          </span>
        </label>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-medium text-slate-400">Target vertical</span>
          <div className="relative">
            <select
              className="h-9 w-full appearance-none rounded-lg border border-white/[0.08] bg-[#15171d] px-3 text-[11px] text-slate-200 outline-none transition-colors focus:border-blue-500/60"
              value={vertical}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'music' || value === 'hospitality') onVerticalChange(value);
              }}
            >
              <option value="music">Music launch / event</option>
              <option disabled value="hospitality">
                Hospitality · coming next
              </option>
            </select>
            <Icon name="chevron" className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-600" />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-slate-400">
            Cultural cues & tags
            <span className="font-normal text-slate-600">Qloo Taste Graph Signals</span>
          </span>
          <textarea
            className="min-h-[76px] w-full resize-none rounded-lg border border-white/[0.08] bg-[#15171d] p-2.5 text-[11px] leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500/60"
            maxLength={1000}
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="e.g. indie rock, dream pop, analogue warmth, intimate..."
          />
          <div className="mt-2">
            <span className="text-[9px] font-medium tracking-wider text-slate-500 uppercase">Quick cues:</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((cue) => {
                const currentList = tags.split(/[,;\n]/).map((t) => t.trim().toLowerCase());
                const isSelected = currentList.includes(cue.toLowerCase());
                return (
                  <button
                    key={cue}
                    type="button"
                    onClick={() => {
                      const tagsArray = tags.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
                      const exists = tagsArray.some((t) => t.toLowerCase() === cue.toLowerCase());
                      const nextTags = exists
                        ? tagsArray.filter((t) => t.toLowerCase() !== cue.toLowerCase())
                        : [...tagsArray, cue];
                      onTagsChange(nextTags.join(', '));
                    }}
                    className={`rounded-full px-2 py-0.5 text-[9px] transition-colors ${
                      isSelected
                        ? 'border border-blue-400/50 bg-blue-500/20 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                        : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {cue}
                  </button>
                );
              })}
            </div>
          </div>
        </label>
      </div>

      <EventPlanInputs plan={eventPlan} onChange={onEventPlanChange} />

      <div className="mt-auto pt-6">
        <ul className="mb-3 space-y-1" aria-label="Readiness checklist">
          {readiness.map((item) => (
            <li key={item.id} className="text-[10px]">
              <span className={item.ok ? 'text-emerald-400' : 'text-amber-300'}>{item.ok ? '✓' : '✗'}</span>{' '}
              <span className="text-slate-300">{item.label}</span>
              {!item.ok && item.fix && <span className="block pl-4 text-[9px] text-slate-500">{item.fix}</span>}
            </li>
          ))}
        </ul>
        <p className="mb-2.5 text-[9px] leading-relaxed text-slate-500">
          Uploads are temporary & destroyed post-analysis. Extracted cultural evidence is retained 30 days.
        </p>
        <button
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-[11px] font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.22)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || blocked}
          onClick={onRun}
          type="button"
        >
          <Icon name="spark" className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
          {buttonText}
        </button>
      </div>
    </section>
  );
}

function EvidencePanel({ result, health }: { result: SimulationResponse | null; health: HealthStatus | null }) {
  const [filterQuery, setFilterQuery] = useState('');

  if (!result) {
    const serviceStatus = health
      ? health.live
        ? 'Live Qloo & Gemini analysis ready'
        : 'Live analysis setup required'
      : 'Checking service readiness…';
    const serviceStatusClass = health?.live
      ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300'
      : 'border-amber-400/20 bg-amber-400/[0.08] text-amber-200';

    return (
      <main className="flex min-h-[520px] flex-col border-b border-white/[0.07] bg-[#0d0e12] p-5 lg:border-r lg:border-b-0 xl:p-6">
        <SectionHeading eyebrow="02 · Cultural evidence" title="Qloo Taste Graph" />
        <div className="my-auto flex flex-col items-center px-5 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] text-blue-400">
            <Icon name="spark" className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-[13px] font-semibold text-slate-200">Ready for cultural grounding</h3>
          <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-slate-500">
            Select a live demo scenario or add a brief to query Qloo&apos;s real taste graph for correlated artist
            affinities.
          </p>
          <div className={`mt-5 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[9px] font-medium ${serviceStatusClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${health?.live ? 'bg-emerald-400' : 'bg-amber-300'}`} />
            {serviceStatus}
          </div>
        </div>
      </main>
    );
  }

  const filteredEvidence = result.evidence.filter((item) => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.domain.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const maxAffinity = Math.max(...result.evidence.map((e) => e.affinity ?? 0), 0);
  const formatAffinity = (value: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);

  return (
    <main className="min-h-0 border-b border-white/[0.07] bg-[#0d0e12] p-5 lg:border-r lg:border-b-0 xl:p-6 overflow-y-auto">
      <div className="flex items-end justify-between gap-4">
        <SectionHeading eyebrow="02 · Cultural evidence" title="Qloo Taste Graph" />
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.06] px-2.5 py-1 text-[9px] text-blue-300">
            Top affinity signal: {formatAffinity(maxAffinity)}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[9px] text-slate-400">
            {result.evidence.length} Matched Artists
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#13151a] p-3.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="font-medium text-slate-300">Executive Affinity Overview</span>
          <span className="text-[9px] text-slate-500">Live Qloo Insights</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{result.summary}</p>
      </div>

      {result.resolvedTags && result.resolvedTags.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#13151a] p-3.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Interest tags resolved by Qloo</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.resolvedTags.map((tag) => (
              <span
                className="rounded-full border border-blue-400/15 bg-blue-400/[0.05] px-2 py-1 text-[9px] text-blue-200"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-600" />
          <input
            type="text"
            placeholder="Filter matched artists or styles..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#15171d] pl-8 pr-3 text-[10px] text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500/60"
          />
        </div>
        {filterQuery && (
          <button
            onClick={() => setFilterQuery('')}
            className="text-[9px] text-slate-500 hover:text-slate-300 underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {filteredEvidence.map((item) => (
          <article
            className="rounded-xl border border-white/[0.07] bg-[#13151a] p-3.5 transition-colors hover:border-white/[0.12]"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[12px] font-semibold text-slate-100">{item.name}</h3>
                <span className="mt-0.5 inline-block rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-medium text-slate-400">
                  {item.domain.replace('urn:entity:', '')}
                </span>
              </div>
              {item.affinity !== null && (
                <div className="text-right">
                  <span className="inline-block rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-0.5 text-[9px] font-semibold text-blue-300">
                    Affinity signal: {formatAffinity(item.affinity)}
                  </span>
                </div>
              )}
            </div>

            {item.description && (
              <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400 line-clamp-2 hover:line-clamp-none">
                {item.description}
              </p>
            )}
            <details className="mt-2 text-[9px] text-slate-500">
              <summary className="cursor-pointer hover:text-slate-300">Qloo contribution details and entity ID</summary>
              {item.explainability ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-[8px]">
                  {JSON.stringify(item.explainability, null, 2)}
                </pre>
              ) : (
                <p className="mt-1 rounded bg-black/20 p-2 text-[8px]">
                  Qloo did not provide per-entity explainability for this result.
                </p>
              )}
              <code className="mt-1 block break-all rounded bg-black/20 p-2">{item.id}</code>
            </details>
          </article>
        ))}

        {filteredEvidence.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
            <p className="text-[10px] text-slate-500">No artists match &ldquo;{filterQuery}&rdquo;</p>
          </div>
        )}
      </div>

      <section className="mt-5 rounded-xl border border-violet-400/15 bg-violet-400/[0.035] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold text-violet-100">Cross-domain: Qloo brand matches</h3>
          <span className="text-[8px] uppercase tracking-wider text-violet-300">Taste tags → brands</span>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-400">
          These are graph-associated brand entities, not confirmed sponsors or local businesses. Verify availability,
          audience fit, and commercial interest independently.
        </p>
        {result.brandEvidenceStatus === 'failed' ? (
          <p className="mt-2 text-[9px] text-amber-200">
            Qloo brand insights were unavailable for this run. Artist evidence remains available.
          </p>
        ) : result.brandEvidenceStatus === 'empty' ? (
          <p className="mt-2 text-[9px] text-slate-500">Qloo returned no brand matches for these tags.</p>
        ) : result.brandEvidenceStatus === 'complete' ? (
          <div className="mt-2.5 flex flex-col gap-2">
            {(result.brandEvidence ?? []).map((brand) => (
              <article className="rounded-lg border border-white/[0.07] bg-[#13151a] p-2.5" key={brand.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-[10px] font-medium text-slate-100">{brand.name}</h4>
                    <span className="text-[8px] text-slate-500">{brand.domain.replace('urn:entity:', '')}</span>
                  </div>
                  {brand.affinity !== null && (
                    <span className="shrink-0 text-[8px] text-violet-200">
                      Affinity signal: {formatAffinity(brand.affinity)}
                    </span>
                  )}
                </div>
                {brand.description && <p className="mt-1 text-[9px] leading-relaxed text-slate-400">{brand.description}</p>}
                <details className="mt-1.5 text-[8px] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300">Qloo contribution details and entity ID</summary>
                  {brand.explainability ? (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2">
                      {JSON.stringify(brand.explainability, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-1 rounded bg-black/20 p-2">
                      Qloo did not provide per-entity explainability for this result.
                    </p>
                  )}
                  <code className="mt-1 block break-all rounded bg-black/20 p-2">{brand.id}</code>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[9px] text-slate-500">This saved result does not include a live brand lookup.</p>
        )}
      </section>

      <p className="mt-5 text-[9px] leading-relaxed text-slate-600 text-center">
        Affinity is shown as the raw numeric value returned by Qloo; it is not a probability of attendance, purchase,
        sponsorship, or an individual&apos;s preferences.
      </p>
    </main>
  );
}

function ComparisonView({ comparison }: { comparison: ComparativeAnalysis }) {
  const { comparativeAnalysis: ca, informedStrategicAnalysis: sa } = comparison;
  const { varianceMetrics: vm } = ca;
  const stats = [
    ['Affinity shift', `${vm.audienceAffinityShift > 0 ? '+' : ''}${vm.audienceAffinityShift.toFixed(2)}`],
    ['Yield differential', vm.projectedYieldDifferential],
    ['Risk mitigation', `${vm.riskFactorMitigationIndex}/100`],
  ];
  return (
    <div className="mt-6 border-t border-white/[0.07] pt-4">
      <h3 className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
        Historical comparison · {ca.historicalBenchmarkEventName}
      </h3>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/[0.07] bg-[#14161c] p-2 text-center">
            <p className="text-[11px] font-semibold text-slate-100">{value}</p>
            <p className="text-[8px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-[10px]">
        <thead className="text-[9px] text-slate-500">
          <tr>
            <th className="py-1 font-medium">Metric</th>
            <th className="py-1 font-medium">Target (projected)</th>
            <th className="py-1 font-medium">Benchmark (actual)</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {ca.sideBySideComparisonTable.map((row) => (
            <tr key={row.metricTracked} className="border-t border-white/[0.05]">
              <td className="py-1.5 pr-2">{row.metricTracked}</td>
              <td className="py-1.5 pr-2">{row.currentTargetProjected}</td>
              <td className="py-1.5">{row.historicalBenchmarkActual}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-1 text-[8px] text-slate-600">Values marked (est.) are extrapolated, not sourced.</p>
      <div className="mt-3 space-y-2.5 text-[10px] leading-relaxed text-slate-300">
        <p>
          <span className="font-semibold text-rose-300">Core vulnerability: </span>
          {sa.coreVulnerabilityVerdict}
        </p>
        <p>
          <span className="font-semibold text-emerald-300">Arbitrage opportunity: </span>
          {sa.marketArbitrageOpportunity}
        </p>
        <ol className="list-decimal space-y-1 pl-4">
          {sa.tacticalExecutionDirectives.map((directive) => (
            <li key={directive}>{directive}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ReportPanel({
  result,
  error,
  stage,
}: {
  result: SimulationResponse | null;
  error: string | null;
  stage: PipelineStage;
}) {
  const [copied, setCopied] = useState(false);

  const copyReport = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shadowpersona-cultural-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isBusy = stage !== 'idle';
  const progressMessage =
    stage === 'uploading'
      ? 'Preparing your brief…'
      : stage === 'mapping'
        ? 'Resolving cultural signals…'
        : 'Generating your analysis report…';

  return (
    <aside aria-busy={isBusy} className="min-h-0 bg-[#101116] p-5 xl:p-6 overflow-y-auto">
      <div className="flex items-end justify-between">
        <SectionHeading eyebrow="03 · Agent synthesis" title="Analysis Report" />
        {result && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyReport}
              type="button"
              className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[8px] font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white"
              title="Copy markdown report"
            >
              <Icon name={copied ? 'check' : 'copy'} className="h-3 w-3 text-blue-400" />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={downloadJson}
              type="button"
              className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[8px] font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white"
              title="Export report JSON"
            >
              <Icon name="download" className="h-3 w-3 text-emerald-400" />
              JSON
            </button>
          </div>
        )}
      </div>

      {isBusy ? (
        <div
          aria-live="polite"
          className="mt-5 rounded-xl border border-blue-400/20 bg-blue-500/[0.05] p-4"
          role="status"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300/25 border-t-blue-300 motion-reduce:animate-none"
            />
            <div>
              <p className="text-[10px] font-semibold text-blue-200">{progressMessage}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
                Waiting for live Qloo, Tavily, and Gemini responses.
              </p>
            </div>
          </div>
          <div aria-hidden="true" className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="analysis-progress-segment block h-full w-1/3 rounded-full bg-blue-400" />
          </div>
        </div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4" role="alert">
          <p className="text-[10px] font-semibold text-amber-200">Analysis could not run</p>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{error}</p>
        </div>
      ) : result ? (
        <div className="mt-5">
          <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-3.5 mb-4">
            <div className="flex items-center gap-1.5 text-blue-300 text-[10px] font-semibold">
              <Icon name="spark" className="h-3.5 w-3.5" />
              Strategic Cultural Verdict
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-300">{result.summary}</p>
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <MarkdownReportView content={result.report} />
          </div>

          {result.comparison ? (
            <ComparisonView comparison={result.comparison} />
          ) : (
            result.comparisonStatus &&
            result.comparisonStatus !== 'complete' && (
              <p className="mt-6 border-t border-white/[0.07] pt-4 text-[10px] text-slate-500">
                {result.comparisonStatus === 'skipped'
                  ? 'Historical comparison was not generated for this run. Review the cited sources and deterministic event forecast for planning context.'
                  : 'Historical comparison could not be generated for this run. The cultural-fit report above is unaffected.'}
              </p>
            )
          )}

          {result.optimization && (
            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <OptimizationSuite optimizationData={result.optimization} />
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <h3 className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Verified Research Sources (Tavily)
              </h3>
              <ul className="mt-2.5 space-y-1.5">
                {result.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="inline-flex items-center gap-1 text-[9px] text-blue-300 underline decoration-blue-300/20 underline-offset-2 hover:text-blue-200"
                      href={source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>🔗</span>
                      <span className="truncate max-w-[260px]">{source.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="my-auto flex flex-col items-center px-4 py-20 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-slate-500">
            <Icon name="spark" className="h-4 w-4" />
          </div>
          <p className="mt-4 text-[11px] font-medium text-slate-400">No report generated yet</p>
          <p className="mt-1.5 max-w-[220px] text-[9px] leading-relaxed text-slate-600">
            Trigger a live scenario or upload a brief to view Gemini AI synthesis grounded in Qloo data.
          </p>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [vertical, setVertical] = useState<TargetVertical>('music');
  const [tags, setTags] = useState('');
  const [eventPlan, setEventPlan] = useState<EventPlan>(() => eventPlanSchema.parse({}));
  const [sourceUrl, setSourceUrl] = useState('');
  const [webResearchEnabled, setWebResearchEnabled] = useState(false);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HealthStatus | null) => setHealth(payload))
      .catch(() => setHealth(null));
  }, []);

  // Manual edits detach the form from the demo scenario so replays never mask user input.
  const detach = () => setSelectedScenarioId(null);

  const loadDemo = async (scenario: DemoScenario, run: boolean) => {
    setError(null);
    setResult(null);
    setLoadingDemo(true);
    let demoFile: File | null = null;
    try {
      if (scenario.file) {
        const response = await fetch(`/api/demo/${scenario.id}/file`);
        if (!response.ok) throw new Error();
        demoFile = new File([await response.blob()], scenario.file, { type: 'application/pdf' });
      }
    } catch {
      setError('The demo file could not be loaded. Reload the page and try again.');
      setLoadingDemo(false);
      return;
    }
    setSelectedScenarioId(scenario.id);
    setVertical(scenario.vertical);
    setTags(scenario.tags);
    const nextEventPlan = scenario.eventPlan ?? eventPlanSchema.parse({});
    setEventPlan(nextEventPlan);
    setSourceUrl(scenario.sourceUrl);
    setFile(demoFile);
    setLoadingDemo(false);
    if (run) {
      await runAnalysis({
        file: demoFile,
        tags: scenario.tags,
        sourceUrl: scenario.sourceUrl,
        vertical: scenario.vertical,
        demoId: scenario.id,
        eventPlan: nextEventPlan,
      });
    }
  };

  const readiness = getReadiness({
    hasFile: Boolean(file),
    fileError: file ? getFileError(file) : null,
    tags,
    sourceUrl,
    hasEventContext: Boolean(eventPlan.featuredTalent.trim() || eventPlan.hosts.trim() || eventPlan.tone.trim()),
    demoScenarioId: selectedScenarioId,
    health,
  });

  const runAnalysis = async (override?: {
    file: File | null;
    tags: string;
    sourceUrl: string;
    vertical: TargetVertical;
    demoId: string | null;
    eventPlan: EventPlan;
    webResearchEnabled?: boolean;
  }) => {
    const current = override ?? { file, tags, sourceUrl, vertical, demoId: selectedScenarioId, eventPlan, webResearchEnabled };
    const {
      file: runFile,
      tags: runTags,
      sourceUrl: runUrl,
      vertical: runVertical,
      demoId,
      eventPlan: runEventPlan,
      webResearchEnabled: runWebResearchEnabled = false,
    } = current;
    setError(null);
    setResult(null);

    const hasEventContext = Boolean(runEventPlan.featuredTalent.trim() || runEventPlan.hosts.trim() || runEventPlan.tone.trim());
    if (!runFile && !runUrl.trim() && !runTags.trim() && !hasEventContext) {
      setError('Select a demo scenario or add a brief, URL, tags, or event talent/host/tone before running.');
      return;
    }
    if (runFile && runUrl.trim()) {
      setError('Use either an uploaded file or a URL in one run, not both.');
      return;
    }
    if (runFile) {
      const fileError = getFileError(runFile);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    if (runUrl.trim()) {
      try {
        const parsedUrl = new URL(runUrl.trim());
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
      } catch {
        setError('Enter a valid HTTP or HTTPS URL.');
        return;
      }
    }

    if (demoId && canReplayDemo(demoId, health)) {
      setStage('analyzing');
      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertical: runVertical,
            tags: runTags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean),
            eventPlan: runEventPlan,
            demoScenarioId: demoId,
          }),
        });
        const payload = await readApiResponse(response, 'Offline demo service');
        const parsedReplay = simulationResponseSchema.safeParse(payload);
        if (!parsedReplay.success) throw new Error('The offline demo result could not be loaded.');
        setResult(parsedReplay.data);
      } catch (cause) {
        setError(getAnalysisErrorMessage(cause));
      } finally {
        setStage('idle');
      }
      return;
    }

    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured yet. Add the project URL and anon key to .env.local, then restart the app.');
      return;
    }

    let uploadedPath: string | null = null;
    let completed = false;
    setStage(runFile ? 'uploading' : 'analyzing');

    const demoSessionId = getDemoSessionId();
    let supabase: ReturnType<typeof createClient> | null = null;
    let hasAuthenticatedSession = false;

    try {
      if (runFile) {
        supabase = createClient();
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          hasAuthenticatedSession = Boolean(session?.user);
        } catch (authError) {
          console.warn('Could not read the Supabase upload session; using direct file transfer.', authError);
        }
      }

      let fileDataPayload: { name: string; type: string; base64: string } | undefined;

      if (runFile) {
        let storageSuccess = false;
        if (hasAuthenticatedSession && supabase) {
          try {
            const signResponse = await fetch('/api/upload/sign', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-demo-session-id': demoSessionId,
              },
              body: JSON.stringify({ fileName: runFile.name, contentType: runFile.type, size: runFile.size }),
            });
            const signPayload = await readApiResponse(signResponse, 'Secure upload service');
            if (
              typeof signPayload === 'object' &&
              signPayload !== null &&
              'path' in signPayload &&
              typeof signPayload.path === 'string' &&
              'token' in signPayload &&
              typeof signPayload.token === 'string'
            ) {
              const { error: uploadError } = await supabase.storage
                .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets')
                .uploadToSignedUrl(signPayload.path, signPayload.token, runFile, { contentType: runFile.type });
              if (!uploadError) {
                uploadedPath = signPayload.path;
                storageSuccess = true;
              } else {
                console.warn('Secure file upload was denied; using direct file transfer.', uploadError);
              }
            }
          } catch (uploadError) {
            console.warn('Secure upload is unavailable; using direct file transfer.', uploadError);
          }
        }

        if (!storageSuccess) {
          if (runFile.size > 3 * 1024 * 1024) {
            throw new Error(
              'Secure upload is unavailable. Files larger than 3 MB require an authenticated Supabase storage session; enable anonymous sign-in and the storage policies, then retry.',
            );
          }
          const buffer = await runFile.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          fileDataPayload = { name: runFile.name, type: runFile.type, base64: btoa(binary) };
        }
      }

      setStage('analyzing');
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-session-id': demoSessionId,
        },
        body: JSON.stringify({
          vertical: runVertical,
          tags: runTags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean),
          eventPlan: runEventPlan,
          location: runEventPlan.location || undefined,
          sourceUrl: runUrl.trim() || undefined,
          enableWebResearch: runWebResearchEnabled,
          uploadPath: uploadedPath ?? undefined,
          fileData: fileDataPayload,
          originalFileName: runFile?.name,
          demoScenarioId: demoId ?? undefined,
        }),
      });
      const payload = await readApiResponse(response, 'Analysis service');

      setStage('analyzing');
      const parsedResult = simulationResponseSchema.safeParse(payload);
      if (!parsedResult.success) {
        throw new Error('The analysis service returned a response in an unexpected format.');
      }
      setResult(parsedResult.data);
      completed = true;
    } catch (cause) {
      setError(getAnalysisErrorMessage(cause));
    } finally {
      if (uploadedPath) {
        try {
          const supabase = createClient();
          const { error: removeError } = await supabase.storage
            .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets')
            .remove([uploadedPath]);
          if (removeError) throw removeError;
        } catch (cleanupError) {
          console.error('Could not delete temporary upload.', cleanupError);
          setError((currentError) =>
            currentError
              ? `${currentError} The temporary upload could not be deleted; please retry or contact support.`
              : 'The temporary upload could not be deleted; please retry or contact support.',
          );
        }
      }
      setStage('idle');
      if (completed) setFile(null);
    }
  };

  const refreshPromoterROI = async (location: PromoterLocation) => {
    if (!result) throw new Error('Run a cultural analysis before changing the venue market.');
    const response = await fetch('/api/promoter-roi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-session-id': getDemoSessionId(),
      },
      body: JSON.stringify({
        tags:
          result.resolvedTags ??
          tags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean),
        location,
        eventPlan,
        enableWebResearch: webResearchEnabled,
      }),
    });
    const payload = await readApiResponse(response, 'Promoter analysis service');
    const parsedPromoterROI = promoterROIDataSchema.safeParse(payload);
    if (!parsedPromoterROI.success) throw new Error('The promoter analysis returned an unexpected response.');
    setResult((current) => (current ? { ...current, promoterROI: parsedPromoterROI.data, promoterROIStatus: 'complete' } : current));
  };

  return (
    <div className="min-h-screen bg-[#0d0e12] text-slate-200">
      <Header stage={stage} health={health} />
      {!selectedScenarioId && !result && !file && !tags && !sourceUrl && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-blue-500/20 bg-blue-500/[0.06] px-4 py-2 text-[11px] text-slate-300">
          <span>First time here? Try it with ready-made demo data, no setup of your own needed.</span>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
            onClick={() => void loadDemo(DEMO_SCENARIOS[0], false)}
          >
            Use demo data
          </button>
        </div>
      )}
      <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[28%_44%_28%]">
        <InputPanel
          file={file}
          onFileChange={(next) => {
            detach();
            setFile(next);
          }}
          vertical={vertical}
          onVerticalChange={setVertical}
          tags={tags}
          onTagsChange={(next) => {
            detach();
            setTags(next);
          }}
          eventPlan={eventPlan}
          onEventPlanChange={(next) => {
            detach();
            setEventPlan(next);
          }}
          sourceUrl={sourceUrl}
          onSourceUrlChange={(next) => {
            detach();
            setSourceUrl(next);
          }}
          webResearchEnabled={webResearchEnabled}
          onWebResearchEnabledChange={setWebResearchEnabled}
          onRun={() => void runAnalysis()}
          stage={loadingDemo ? 'uploading' : stage}
          selectedScenarioId={selectedScenarioId}
          onSelectScenario={(scenario) => void loadDemo(scenario, false)}
          readiness={readiness}
          onLoadDemo={(scenario, run) => void loadDemo(scenario, run)}
        />
        <EvidencePanel result={result} health={health} />
        <ReportPanel result={result} error={error} stage={stage} />
      </div>
      {result && hasEventPlanningInput(eventPlan) && (
        <div className="border-t border-[#1F222F] bg-[#0D0E12] p-3 sm:p-5 xl:p-7">
          <EventForecastPanel forecast={result.eventForecast} label={result.eventForecast?.label ?? eventPlan.demoLabel} />
        </div>
      )}
      {result?.promoterROI ? (
        <div className="border-t border-[#1F222F] bg-[#0D0E12] p-3 sm:p-5 xl:p-7">
          <PromoterROIConsole
            data={result.promoterROI}
            tags={result.resolvedTags ?? tags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean)}
            onLocationChange={refreshPromoterROI}
          />
        </div>
      ) : result?.mode === 'fixture' ? (
        <PromoterROIUnavailable
          canGenerate={Boolean(health?.qloo && health.analysisModel)}
          onGenerate={refreshPromoterROI}
        />
      ) : result?.promoterROIStatus === 'failed' ? (
        <div role="status" className="border-t border-[#1F222F] bg-[#101116] p-4 text-center text-xs text-amber-200">
          Promoter ROI data could not be generated for this analysis. The cultural evidence and report above remain available.
        </div>
      ) : null}
      {result?.mode === 'fixture' && (
        <p className="border-t border-white/[0.07] bg-amber-500/10 px-4 py-1.5 text-center text-[10px] text-amber-200">
          Offline demo: this is a recorded real result, not a live analysis.
        </p>
      )}
    </div>
  );
}
