'use client';

import { useState } from 'react';
import { optimizationDataSchema } from '../types/shadowpersona';

const BRAND_BLUE = '#2563EB';
const PANEL_BORDER = '#1F222F';

const FALLBACK_NOTICE =
  'Live location context data metrics currently unavailable. Defaulting simulation pipeline to baseline subcultural ontological presets.';

function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-100">{title}</h2>
    </div>
  );
}

// `optimizationData` is typed unknown on purpose: the payload comes from the network and is validated here.
export default function OptimizationSuite({ optimizationData }: { optimizationData: unknown }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const parsed = optimizationDataSchema.safeParse(optimizationData);

  if (!parsed.success) {
    return (
      <section role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-xs text-rose-200">
        The optimization data was returned in an unexpected format and cannot be displayed.
      </section>
    );
  }

  const { preEventOptimization: pre, postEventOptimization: post, competitiveBenchmarks, comparisonStatus, geminiRationale } =
    parsed.data;
  const degraded = comparisonStatus === 'failed' || comparisonStatus === 'skipped';

  return (
    <section aria-label="Optimization suite" className="space-y-6 rounded-2xl bg-[#0d0e12] p-4 text-slate-200 sm:p-6">
      {degraded && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100"
        >
          <span aria-hidden className="mt-0.5 text-base">
            ⚠
          </span>
          <p>{FALLBACK_NOTICE}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-5 rounded-xl border border-white/[0.07] bg-[#101116] p-5">
          <SectionTitle eyebrow="Phase 01" title="Pre-Event Strategy" />

          <div>
            <h3 className="text-[11px] font-medium text-slate-400">Recommended ticket pricing tiers</h3>
            <ul className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pre.recommendedTicketPricingTiers.map((tier) => (
                <li
                  key={tier.name}
                  className="rounded-xl border-2 bg-[#0d0e12] p-4 shadow-[0_0_24px_rgba(37,99,235,0.12)]"
                  style={{ borderColor: BRAND_BLUE }}
                >
                  <p className="text-3xl font-bold tracking-tight text-white">{formatPrice(tier.price)}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-300">{tier.name}</p>
                  {tier.note && <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{tier.note}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-600">Modelled recommendations, not sourced market prices.</p>
          </div>

          <div>
            <h3 className="text-[11px] font-medium text-slate-400">Marketing channel mix</h3>
            <ul className="mt-2.5 space-y-3">
              {pre.marketingChannelMix.map((item) => (
                <li key={item.channel}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-300">{item.channel}</span>
                    <span className="font-semibold tabular-nums text-slate-100">{item.allocationPct}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${item.channel} allocation`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.allocationPct}
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.allocationPct}%`, backgroundColor: BRAND_BLUE }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-rose-400/25 bg-rose-500/[0.05] p-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Primary operational risk</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{pre.primaryOperationalRisk}</p>
          </div>
        </div>

        <div className="space-y-5 rounded-xl border border-white/[0.07] bg-[#101116] p-5">
          <SectionTitle eyebrow="Phase 02" title="Post-Event Capitalization" />

          <div className="rounded-xl border border-blue-400/30 bg-gradient-to-br from-blue-500/15 to-transparent p-5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Estimated LTV multiplier</p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-white">
              {post.estimatedLtvMultiplier.toFixed(1)}
              <span className="text-3xl text-blue-400">×</span>
            </p>
            <p className="mt-1 text-[10px] text-slate-500">Modelled estimate, not a measured result.</p>
          </div>

          <div>
            <h3 className="text-[11px] font-medium text-slate-400">Audience retention strategy</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{post.audienceRetentionStrategy}</p>
          </div>

          <div>
            <h3 className="text-[11px] font-medium text-slate-400">Downstream brand partnership actions</h3>
            <ul className="mt-2.5 space-y-2">
              {post.downstreamBrandPartnershipSuggestions.map((suggestion, index) => {
                const id = `partner-${index}`;
                return (
                  <li key={id}>
                    <label
                      htmlFor={id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.07] bg-[#0d0e12] p-3 text-xs text-slate-300 transition-colors hover:border-blue-400/40"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={Boolean(checked[id])}
                        onChange={(event) => setChecked((current) => ({ ...current, [id]: event.target.checked }))}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                      />
                      <span className={checked[id] ? 'text-slate-500 line-through' : ''}>{suggestion}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#101116] p-5">
        <SectionTitle eyebrow="Verified research & source anchors" title="Live Market Reference Data & Sources" />
        {competitiveBenchmarks.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No live market references were available for this run.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {competitiveBenchmarks.map((benchmark) => (
              <li key={benchmark.url} className="rounded-lg border border-white/[0.07] bg-[#0d0e12] p-3.5">
                <p className="text-xs leading-relaxed text-slate-300">{benchmark.snippet}</p>
                <a
                  href={benchmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 break-all text-xs font-semibold text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:text-blue-300"
                >
                  {benchmark.title} <span aria-hidden>↗</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-[#101116] p-5" style={{ borderColor: PANEL_BORDER }}>
        <h2 className="text-sm font-semibold text-slate-100">How Gemini Reasoning Enhances Operational Outcomes</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Gemini turns the Qloo taste evidence and live market references into the pricing, channel and partnership
          recommendations above, and states where its confidence is limited.
        </p>
        <p
          className="mt-3 whitespace-pre-wrap rounded-lg border bg-[#0d0e12] p-4 text-xs leading-relaxed text-slate-300"
          style={{ borderColor: PANEL_BORDER }}
        >
          {geminiRationale}
        </p>
      </div>
    </section>
  );
}