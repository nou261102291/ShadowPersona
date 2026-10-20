'use client';

import { useRef, useState, type DragEvent } from 'react';
import { createClient } from './lib/supabase/client';
import { isSupabaseConfigured } from './lib/supabase/config';
import { simulationResponseSchema } from './types/shadowpersona';
import type { SimulationResponse, TargetVertical } from './types/shadowpersona';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);

type PipelineStage = 'idle' | 'uploading' | 'mapping' | 'analyzing';

function fileIsSupported(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTENSIONS.has(extension);
}

function getFileError(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return 'Choose a file smaller than 10 MB.';
  if (!fileIsSupported(file)) return 'Supported formats are PDF, PNG, and JPG.';
  return null;
}

function Icon({ name, className = 'h-4 w-4' }: { name: 'arrow' | 'check' | 'chevron' | 'file' | 'spark' | 'upload'; className?: string }) {
  const paths = {
    arrow: <path d="m5 12 5 5L20 7M20 7H9m11 0v11" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    file: (
      <>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h5M9 13h6M9 17h4" />
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

function Header({ stage }: { stage: PipelineStage }) {
  const steps = [
    { label: 'Asset input', active: stage === 'uploading' },
    { label: 'Qloo graph', active: stage === 'mapping' },
    { label: 'Agent report', active: stage === 'analyzing' },
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
          <p className="hidden text-[9px] font-medium uppercase tracking-[0.18em] text-slate-600 sm:block">
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

      <div className="flex items-center gap-2 rounded-full border border-amber-400/15 bg-amber-400/[0.05] px-3 py-1.5 text-[9px] font-medium text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        Qloo access pending
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
        className={`group relative mt-5 flex min-h-[156px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-5 text-center transition-all ${
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
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-transform group-hover:-translate-y-0.5">
          <Icon name={file ? 'file' : 'upload'} className="h-5 w-5" />
        </div>
        <p className="mt-3 max-w-full truncate text-[12px] font-medium text-slate-200">
          {file?.name ?? 'Drop a launch brief or campaign image'}
        </p>
        <p className="mt-1 text-[10px] text-slate-600">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · removed after processing` : 'PDF, PNG or JPG · max 10 MB'}
        </p>
        <span className="mt-3 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[9px] font-medium text-slate-400">
          Browse files
        </span>
      </div>
      {fileError && <p className="mt-2 text-[10px] text-rose-300">{fileError}</p>}
      {file && (
        <button
          className="mt-2 text-[10px] text-slate-500 underline decoration-white/20 underline-offset-2 hover:text-slate-200"
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
  );
}

function InputPanel({
  file,
  onFileChange,
  vertical,
  onVerticalChange,
  tags,
  onTagsChange,
  sourceUrl,
  onSourceUrlChange,
  onRun,
  stage,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  vertical: TargetVertical;
  onVerticalChange: (vertical: TargetVertical) => void;
  tags: string;
  onTagsChange: (tags: string) => void;
  sourceUrl: string;
  onSourceUrlChange: (url: string) => void;
  onRun: () => void;
  stage: PipelineStage;
}) {
  const busy = stage !== 'idle';
  const buttonText =
    stage === 'uploading'
      ? 'Uploading asset...'
      : stage === 'mapping'
        ? 'Mapping with Qloo...'
        : stage === 'analyzing'
          ? 'Preparing agent report...'
          : 'Run cultural analysis';

  return (
    <section className="flex min-h-0 flex-col border-b border-white/[0.07] bg-[#101116] p-5 lg:border-r lg:border-b-0 xl:p-6">
      <SectionHeading eyebrow="01 · Input framework" title="Launch Brief" />
      <FileDropzone file={file} onFileChange={onFileChange} />

      <div className="my-3 flex items-center gap-3 text-[9px] uppercase tracking-widest text-slate-600">
        <span className="h-px flex-1 bg-white/[0.07]" />
        or provide a URL
        <span className="h-px flex-1 bg-white/[0.07]" />
      </div>
      <label className="block">
        <span className="sr-only">Campaign or artist URL</span>
        <input
          className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#15171d] px-3 text-[11px] text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500/60"
          maxLength={2048}
          type="url"
          value={sourceUrl}
          onChange={(event) => onSourceUrlChange(event.target.value)}
          placeholder="https://artist-or-campaign.example"
        />
      </label>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-[10px] font-medium text-slate-400">Target vertical</span>
          <div className="relative">
            <select
              className="h-10 w-full appearance-none rounded-lg border border-white/[0.08] bg-[#15171d] px-3 text-[11px] text-slate-200 outline-none transition-colors focus:border-blue-500/60"
              value={vertical}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'music' || value === 'hospitality') onVerticalChange(value);
              }}
            >
              <option value="music">Music launch / event</option>
              <option disabled value="hospitality">Hospitality · coming next</option>
            </select>
            <Icon name="chevron" className="pointer-events-none absolute top-3 right-3 h-4 w-4 text-slate-600" />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 flex items-center justify-between text-[10px] font-medium text-slate-400">
            Cultural cues and tags
            <span className="font-normal text-slate-700">Optional</span>
          </span>
          <textarea
            className="min-h-[104px] w-full resize-none rounded-lg border border-white/[0.08] bg-[#15171d] p-3 text-[11px] leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500/60"
            maxLength={1000}
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="e.g. indie soul, intimate venues, analogue warmth..."
          />
        </label>
      </div>

      <div className="mt-auto pt-5">
        <p className="mb-3 text-[9px] leading-relaxed text-slate-600">
          Uploaded originals are temporary. Extracted context and results are retained for 30 days.
        </p>
        <button
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-[11px] font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.22)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
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

function EvidencePanel({ result }: { result: SimulationResponse | null }) {
  if (!result) {
    return (
      <main className="flex min-h-[520px] flex-col border-b border-white/[0.07] bg-[#0d0e12] p-5 lg:border-r lg:border-b-0 xl:p-6">
        <SectionHeading eyebrow="02 · Cultural evidence" title="Qloo Taste Graph" />
        <div className="my-auto flex flex-col items-center px-5 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] text-blue-400">
            <Icon name="spark" className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-[13px] font-semibold text-slate-200">Ready for cultural grounding</h3>
          <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-slate-500">
            Add a music launch brief, image, or URL. Once Qloo access is configured, this panel will show the actual
            cultural matches used by the agent.
          </p>
          <span className="mt-5 rounded-full border border-amber-400/15 bg-amber-400/[0.05] px-3 py-1.5 text-[9px] text-amber-200">
            Live Qloo API connection pending
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-0 border-b border-white/[0.07] bg-[#0d0e12] p-5 lg:border-r lg:border-b-0 xl:p-6">
      <div className="flex items-end justify-between gap-4">
        <SectionHeading eyebrow="02 · Cultural evidence" title="Qloo Taste Graph" />
        <p className="text-right text-[9px] text-slate-500">{result.evidence.length} returned matches</p>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{result.summary}</p>
      <div className="mt-5 flex flex-col gap-3">
        {result.evidence.map((item) => (
          <article className="rounded-xl border border-white/[0.07] bg-[#13151a] p-4" key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[12px] font-semibold text-slate-100">{item.name}</h3>
                <p className="mt-1 text-[9px] text-slate-500">{item.domain}</p>
              </div>
              {item.affinity !== null && (
                <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.06] px-2.5 py-1 text-[9px] text-blue-300">
                  {item.affinity}% affinity
                </span>
              )}
            </div>
            {item.description && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{item.description}</p>}
          </article>
        ))}
      </div>
    </main>
  );
}

function ReportPanel({ result, error }: { result: SimulationResponse | null; error: string | null }) {
  return (
    <aside className="min-h-0 bg-[#101116] p-5 xl:p-6">
      <div className="flex items-end justify-between">
        <SectionHeading eyebrow="03 · Agent synthesis" title="Analysis Report" />
        <span className="rounded-full border border-white/[0.07] px-2 py-1 text-[8px] text-slate-500">
          Evidence-led
        </span>
      </div>
      {error ? (
        <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4" role="alert">
          <p className="text-[10px] font-semibold text-amber-200">Analysis could not run</p>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{error}</p>
        </div>
      ) : result ? (
        <>
          <p className="mt-5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{result.report}</p>
          {result.sources.length > 0 && (
            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <h3 className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Research sources</h3>
              <ul className="mt-3 space-y-2">
                {result.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-[9px] text-blue-300 underline decoration-blue-300/20 underline-offset-2 hover:text-blue-200"
                      href={source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <p className="text-[10px] leading-relaxed text-slate-500">
            The agent will explain its recommendations only after it has received live Qloo evidence. No simulated
            personas or financial forecasts are shown here.
          </p>
        </div>
      )}
      <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.018] px-3.5 py-3">
        <p className="text-[9px] font-medium text-slate-400">Data handling</p>
        <p className="mt-1 text-[8px] leading-relaxed text-slate-600">
          Original uploads are deleted after processing. Saved extracted context is removed after 30 days.
        </p>
      </div>
    </aside>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [vertical, setVertical] = useState<TargetVertical>('music');
  const [tags, setTags] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  const runAnalysis = async () => {
    setError(null);
    setResult(null);

    if (!file && !sourceUrl.trim()) {
      setError('Add a PDF/image or a URL before running the analysis.');
      return;
    }
    if (file && sourceUrl.trim()) {
      setError('Use either an uploaded file or a URL in one run, not both.');
      return;
    }
    if (file) {
      const fileError = getFileError(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    if (sourceUrl.trim()) {
      try {
        const parsedUrl = new URL(sourceUrl.trim());
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
      } catch {
        setError('Enter a valid HTTP or HTTPS URL.');
        return;
      }
    }
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured yet. Add the project URL and anon key to .env.local, then restart the app.');
      return;
    }

    let uploadedPath: string | null = null;
    let completed = false;
    setStage(file ? 'uploading' : 'mapping');

    try {
      const supabase = createClient();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      let user = currentUser;
      if (!user) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw new Error(`Could not start a private demo session: ${authError.message}`);
        user = data.user;
      }
      if (!user) throw new Error('Could not establish a private demo session.');

      if (file) {
        const signResponse = await fetch('/api/upload/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
        });
        const signPayload: unknown = await signResponse.json();
        if (!signResponse.ok) {
          const message =
            typeof signPayload === 'object' &&
            signPayload !== null &&
            'error' in signPayload &&
            typeof signPayload.error === 'string'
              ? signPayload.error
              : `Secure upload preparation returned HTTP ${signResponse.status}.`;
          throw new Error(message);
        }
        if (
          typeof signPayload !== 'object' ||
          signPayload === null ||
          !('path' in signPayload) ||
          typeof signPayload.path !== 'string' ||
          !('token' in signPayload) ||
          typeof signPayload.token !== 'string'
        ) {
          throw new Error('Secure upload preparation returned an invalid response.');
        }
        uploadedPath = signPayload.path;

        const { error: uploadError } = await supabase.storage
          .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets')
          .uploadToSignedUrl(uploadedPath, signPayload.token, file, { contentType: file.type });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setStage('mapping');
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          tags: tags.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean),
          sourceUrl: sourceUrl.trim() || undefined,
          uploadPath: uploadedPath ?? undefined,
          originalFileName: file?.name,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `The analysis service returned HTTP ${response.status}.`;
        throw new Error(message);
      }

      setStage('analyzing');
      const parsedResult = simulationResponseSchema.safeParse(payload);
      if (!parsedResult.success) {
        throw new Error('The analysis service returned a response in an unexpected format.');
      }
      setResult(parsedResult.data);
      completed = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The analysis was interrupted by an unexpected error.');
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

  return (
    <div className="min-h-screen bg-[#0d0e12] text-slate-200">
      <Header stage={stage} />
      <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[25%_45%_30%]">
        <InputPanel
          file={file}
          onFileChange={setFile}
          vertical={vertical}
          onVerticalChange={setVertical}
          tags={tags}
          onTagsChange={setTags}
          sourceUrl={sourceUrl}
          onSourceUrlChange={setSourceUrl}
          onRun={() => void runAnalysis()}
          stage={stage}
        />
        <EvidencePanel result={result} />
        <ReportPanel result={result} error={error} />
      </div>
    </div>
  );
}
