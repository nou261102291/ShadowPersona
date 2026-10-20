'use client';

import { useState } from 'react';
import { promoterLocationSchema, type PromoterLocation } from '@/types/shadowpersona';

interface PromoterROIUnavailableProps {
  canGenerate: boolean;
  onGenerate: (location: PromoterLocation) => Promise<void>;
}

export default function PromoterROIUnavailable({ canGenerate, onGenerate }: PromoterROIUnavailableProps) {
  const [location, setLocation] = useState<PromoterLocation>('San Francisco, CA');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await onGenerate(location);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promoter ROI data could not be generated.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section
      aria-label="Promoter ROI data unavailable"
      className="border-t border-[#1F222F] bg-[#0D0E12] p-4 sm:p-5"
    >
      <div className="mx-auto max-w-5xl rounded-xl border border-amber-400/25 bg-amber-500/[0.04] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-amber-100">Promoter ROI data unavailable</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          Promoter ROI data is not cached for this historic run. Select a live market location to generate dynamic actuarial models.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block w-full sm:max-w-xs">
            <span className="mb-1.5 block text-[10px] text-slate-500">Live market location</span>
            <select
              value={location}
              onChange={(event) => {
                const parsed = promoterLocationSchema.safeParse(event.target.value);
                if (parsed.success) setLocation(parsed.data);
              }}
              className="h-10 w-full rounded-lg border border-[#1F222F] bg-[#0D0E12] px-3 text-xs text-white outline-none focus:border-indigo-400"
            >
              {promoterLocationSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!canGenerate || isGenerating}
            onClick={() => void generate()}
            className="h-10 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-4 text-xs font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? 'Generating market model…' : 'Generate Promoter ROI'}
          </button>
        </div>
        {!canGenerate && (
          <p className="mt-2 text-[10px] text-amber-200/80">
            Live Qloo and Gemini services must be configured before fresh models can be generated.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/[0.06] p-3 text-xs text-rose-200">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
