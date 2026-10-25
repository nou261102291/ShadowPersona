'use client';

import { useMemo, useState } from 'react';
import {
  promoterLocationSchema,
  promoterROIDataSchema,
  type PromoterLocation,
  type PromoterROIData,
} from '@/types/shadowpersona';

const FALLBACK_NOTICE =
  'Optional public market research was not included or could not be retrieved. Recommendations rely on Qloo cultural evidence and submitted assumptions; no live market metrics were established.';
const suggestedLocations = ['San Francisco, CA', 'Oakland, CA', 'Los Angeles, CA', 'New York, NY', 'London, UK'];
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

interface PromoterROIConsoleProps {
  data: unknown;
  tags: string[];
  onLocationChange: (location: PromoterLocation) => Promise<void>;
}

function trendLabel(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function MetricCard({
  label,
  value,
  supporting,
  trend,
}: {
  label: string;
  value: string;
  supporting: string;
  trend?: number;
}) {
  const trendColor = trend === undefined ? 'text-slate-500' : trend >= 0 ? 'text-lime-300' : 'text-amber-300';
  return (
    <div className="rounded-xl border border-[#1F222F] bg-[#0D0E12] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
        {trend !== undefined && <span className={`text-xs font-semibold ${trendColor}`}>{trendLabel(trend)}</span>}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{supporting}</p>
    </div>
  );
}

function SupplyDemandChart({ data }: { data: PromoterROIData['pricing']['supplyDemandCurve'] }) {
  const points = useMemo(() => {
    const min = Math.min(...data.map((point) => point.priceUsd));
    const max = Math.max(...data.map((point) => point.priceUsd));
    return data
      .map((point, index) => {
        const x = 24 + (index / Math.max(data.length - 1, 1)) * 270;
        const y = 104 - point.demandIndex * 0.78;
        return { ...point, x, y, normalizedPrice: max === min ? 0 : (point.priceUsd - min) / (max - min) };
      })
      .sort((left, right) => left.normalizedPrice - right.normalizedPrice);
  }, [data]);

  return (
    <div className="rounded-xl border border-[#1F222F] bg-[#0D0E12] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-200">Local ticket supply-and-demand curve</h3>
        <span className="text-[10px] text-slate-500">Modelled demand index · higher is stronger</span>
      </div>
      <svg
        role="img"
        aria-label={`Projected demand falls from ${points[0]?.demandIndex ?? 0} to ${points[points.length - 1]?.demandIndex ?? 0} as ticket price increases`}
        viewBox="0 0 320 138"
        className="mt-3 h-36 w-full"
        preserveAspectRatio="none"
      >
        <line x1="24" y1="104" x2="300" y2="104" stroke="#343849" />
        <line x1="24" y1="24" x2="24" y2="104" stroke="#343849" />
        {[25, 50, 75, 100].map((tick) => {
          const y = 104 - tick * 0.78;
          return <line key={tick} x1="24" y1={y} x2="300" y2={y} stroke="#1F222F" strokeDasharray="3 4" />;
        })}
        <polyline
          fill="none"
          stroke="#84CC16"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        />
        {points.map((point) => (
          <circle key={`${point.priceUsd}-${point.demandIndex}`} cx={point.x} cy={point.y} r="3.5" fill="#A3E635" />
        ))}
        <text x="24" y="127" fill="#94A3B8" fontSize="9">
          {money.format(points[0]?.priceUsd ?? 0)}
        </text>
        <text x="300" y="127" fill="#94A3B8" fontSize="9" textAnchor="end">
          {money.format(points[points.length - 1]?.priceUsd ?? 0)}
        </text>
      </svg>
      <div className="flex justify-between text-[9px] text-slate-500">
        <span>Ticket price (USD)</span>
        <span>Demand index: 0–100</span>
      </div>
    </div>
  );
}

function sponsorshipPitch(match: PromoterROIData['sponsorshipMatches'][number], location: string): string {
  return [
    `## Sponsor category to validate: ${match.targetBrandCategory}`,
    '',
    `**Market:** ${location}`,
    `**Modelled cultural-alignment index:** ${match.audienceAffinityMatchPct}/100 (heuristic, not a Qloo score or purchase-intent probability)`,
    '',
    `**Model-generated rationale:** ${match.justification}`,
    '',
    '**Proposed next step:** Treat this as a research lead; verify the partner, local availability, audience fit, and commercial interest before outreach.',
  ].join('\n');
}

export default function PromoterROIConsole({ data, tags, onLocationChange }: PromoterROIConsoleProps) {
  const parsed = promoterROIDataSchema.safeParse(data);
  const [artistId, setArtistId] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [location, setLocation] = useState<PromoterLocation>(() =>
    parsed.success ? parsed.data.location : 'San Francisco, CA',
  );
  const [locationDraft, setLocationDraft] = useState(location);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null);
  const [copiedPitch, setCopiedPitch] = useState<string | null>(null);
  if (!parsed.success) {
    return (
      <section role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-xs text-rose-200">
        Promoter ROI data was returned in an unexpected format and cannot be displayed.
      </section>
    );
  }

  const report = parsed.data;
  const selectedProfile = report.talentProfiles.find((profile) => profile.artistId === artistId) ?? report.talentProfiles[0];
  const degraded = report.comparisonStatus !== 'complete';

  const refreshLocation = async (next: PromoterLocation) => {
    if (isRefreshing) return;
    const parsedLocation = promoterLocationSchema.safeParse(next);
    if (!parsedLocation.success) {
      setRefreshError('Enter a city or market name between 2 and 120 characters.');
      return;
    }
    if (parsedLocation.data === location) return;
    setLocation(parsedLocation.data);
    setLocationDraft(parsedLocation.data);
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await onLocationChange(parsedLocation.data);
    } catch (cause) {
      setLocation(report.location);
      setLocationDraft(report.location);
      setRefreshError(cause instanceof Error ? cause.message : 'The location analysis could not be refreshed.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const selectArtist = (value: string) => {
    setArtistQuery(value);
    const match = report.talentProfiles.find((profile) => profile.artistName.toLowerCase() === value.trim().toLowerCase());
    if (match) setArtistId(match.artistId);
  };

  const copyPitch = async (id: string, pitch: string) => {
    try {
      await navigator.clipboard.writeText(pitch);
      setCopiedPitch(id);
      window.setTimeout(() => setCopiedPitch(null), 1800);
    } catch {
      setRefreshError('Your browser could not copy the pitch. Select the text and copy it manually.');
    }
  };

  return (
    <section aria-label="Promoter ROI console" className="space-y-5 rounded-2xl border border-[#1F222F] bg-[#0D0E12] p-4 text-slate-200 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">Promoter intelligence workspace</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Promoter ROI Console</h2>
        </div>
        <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-200">
          {report.comparisonStatus === 'complete'
            ? 'Qloo + cited public research'
            : report.comparisonStatus === 'failed'
              ? 'Qloo · web research failed'
              : 'Qloo · no web research'}
        </span>
      </header>

      {degraded && (
        <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          {FALLBACK_NOTICE}
        </div>
      )}
      {refreshError && (
        <div role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {refreshError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[#1F222F] bg-[#101116]">
        <div className="border-b border-[#1F222F] px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-lime-300">Workflow step 01</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Talent De-Risking Sandbox</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 p-4 md:grid-cols-2 md:p-5">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-200">Artist Input Telemetry</h4>
            <label className="block">
              <span className="mb-1.5 block text-[10px] text-slate-500">Search Qloo-matched artist or talent</span>
              <input
                list="promoter-talent-options"
                value={artistQuery || selectedProfile.artistName}
                onChange={(event) => selectArtist(event.target.value)}
                placeholder="Type an artist name..."
                className="h-10 w-full rounded-lg border border-[#1F222F] bg-[#0D0E12] px-3 text-xs text-white outline-none transition focus:border-indigo-400"
              />
              <datalist id="promoter-talent-options">
                {report.talentProfiles.map((profile) => (
                  <option key={profile.artistId} value={profile.artistName} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] text-slate-500">Target venue market</span>
              <div className="flex gap-2">
                <input
                  list="promoter-market-options"
                  value={locationDraft}
                  disabled={isRefreshing}
                  onChange={(event) => setLocationDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void refreshLocation(locationDraft);
                    }
                  }}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[#1F222F] bg-[#0D0E12] px-3 text-xs text-white outline-none focus:border-indigo-400 disabled:opacity-60"
                  aria-label="Target venue market"
                />
                <datalist id="promoter-market-options">
                  {suggestedLocations.map((item) => <option key={item} value={item} />)}
                </datalist>
                <button
                  type="button"
                  disabled={isRefreshing || locationDraft.trim() === location}
                  onClick={() => void refreshLocation(locationDraft)}
                  className="rounded-lg border border-indigo-400/30 px-3 text-[10px] font-semibold text-indigo-200 disabled:opacity-50"
                >
                  Update
                </button>
              </div>
              {isRefreshing && <span className="mt-1 block text-[10px] text-indigo-300">Refreshing local market signals…</span>}
            </label>
            <div className="rounded-xl border border-lime-400/20 bg-lime-500/[0.04] p-4">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-lime-300">Talent Loss Protection Coefficient</p>
              <p className="mt-1 text-4xl font-bold tabular-nums text-lime-300">
                {selectedProfile.lossProtectionCoefficientPct}
                <span className="text-xl">/100</span>
              </p>
              <p className="mt-1 text-[10px] text-slate-500">Modelled planning heuristic; not actuarial risk, a guarantee, or insurance.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Modelled Talent-Fit Heuristics</h4>
              <p className="mt-1 text-[10px] text-slate-500">{selectedProfile.artistName} · {location}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#1F222F] bg-[#0D0E12] p-3">
                <p className="text-[9px] uppercase tracking-wider text-slate-500">Cultural-fit estimate</p>
                <p className="mt-1 text-xl font-bold text-indigo-200">{selectedProfile.fanProfileAlignmentPct}/100</p>
              </div>
              <div className="rounded-lg border border-[#1F222F] bg-[#0D0E12] p-3">
                <p className="text-[9px] uppercase tracking-wider text-slate-500">Local-market fit estimate</p>
                <p className="mt-1 text-xl font-bold text-indigo-200">{selectedProfile.localVenueDemographicAlignmentPct}/100</p>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              These are model-generated 0–100 planning heuristics based on the event brief and Qloo artist evidence. They
              are not Qloo scores, measured demographics, audience overlap, attendance, or purchase intent.
            </p>
            <ul className="space-y-2">
              {selectedProfile.alignmentBreakdown.map((item) => (
                <li key={item.dimension}>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">{item.dimension}</span>
                    <span className="font-semibold tabular-nums text-slate-200">{item.alignmentPct}/100</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${item.dimension} modelled index`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.alignmentPct}
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-lime-300" style={{ width: `${item.alignmentPct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {selectedProfile.localVenueDemographicAlignmentPct < 75 && (
              <div role="alert" className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100">
                Planning prompt: the modelled local-market fit index is below the display threshold. Verify local audience reach and event economics with organizer data; this score does not establish vacancy risk.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#1F222F] bg-[#101116]">
        <div className="border-b border-[#1F222F] px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-lime-300">Workflow step 02</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Dynamic Price Elasticity &amp; Yield Engine</h3>
        </div>
        <div className="space-y-4 p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard
              label="Optimal General Admission Tier"
              value={money.format(report.pricing.optimalGeneralAdmissionTierUsd)}
              supporting={
                report.pricing.localCompetitorAverageUsd === null
                  ? 'Projected tier · no verified local competitor average found'
                  : `Projected tier · reported local competitor average ${money.format(report.pricing.localCompetitorAverageUsd)}`
              }
              trend={report.pricing.generalAdmissionTrendPct}
            />
            <MetricCard
              label="VIP Premium Ceiling Tier"
              value={money.format(report.pricing.vipPremiumCeilingTierUsd)}
              supporting="Projected premium price ceiling · USD"
              trend={report.pricing.vipTrendPct}
            />
          </div>

          {report.pricing.localCompetitorAverageUsd !== null && report.pricing.localCompetitorSourceUrl && (
            <a
              href={report.pricing.localCompetitorSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-[10px] font-medium text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
            >
              Verify reported competitor-price source ↗
            </a>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-xl border border-[#1F222F] bg-[#0D0E12] p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-200">Attendee Margin Optimization</h4>
                <span className="text-sm font-bold tabular-nums text-lime-300">{report.pricing.attendeeMarginOptimizationPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Attendee margin optimization"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={report.pricing.attendeeMarginOptimizationPct}
                className="mt-3 h-3 overflow-hidden rounded-full bg-white/[0.07]"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-lime-300"
                  style={{ width: `${report.pricing.attendeeMarginOptimizationPct}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Modelled margin index; validate against venue costs.</p>
            </div>
            <SupplyDemandChart data={report.pricing.supplyDemandCurve} />
          </div>
          <p className="text-[10px] text-slate-500">Trend values are projected deltas, not observed sales changes. All projected prices are USD.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#1F222F] bg-[#101116]">
        <div className="border-b border-[#1F222F] px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-lime-300">Workflow step 03</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Sponsor Category Research Leads</h3>
        </div>
        <div className="p-4 md:p-5">
          <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
            Model-generated category hypotheses informed by the event context and artist evidence. These are not
            Qloo-returned brands, verified sponsors, local availability checks, or measured purchase intent.
          </p>
          {report.sponsorshipMatches.length === 0 ? (
            <p className="text-xs text-slate-500">No sponsor-category research leads were generated for this run.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1F222F] text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Target Brand Category</th>
                      <th className="px-3 py-2">Modelled Alignment Index</th>
                      <th className="px-3 py-2">Model-Generated Rationale</th>
                      <th className="px-3 py-2">Pitch Builder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sponsorshipMatches.map((match, index) => {
                      const id = `${match.targetBrandCategory}-${index}`;
                      const pitch = sponsorshipPitch(match, location);
                      return (
                        <tr key={id} className="border-b border-[#1F222F]/70 align-top">
                          <td className="px-3 py-3 font-medium text-white">{match.targetBrandCategory}</td>
                          <td className={`px-3 py-3 font-bold tabular-nums ${match.audienceAffinityMatchPct > 85 ? 'text-lime-300' : 'text-indigo-200'}`}>
                            {match.audienceAffinityMatchPct}/100
                          </td>
                          <td className="px-3 py-3 leading-relaxed text-slate-400">{match.justification}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedPitch(expandedPitch === id ? null : id)}
                              className="whitespace-nowrap rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-500/20"
                            >
                              {expandedPitch === id ? 'Hide Executive Pitch' : 'Generate Executive Pitch Deck'}
                            </button>
                            {expandedPitch === id && (
                              <div className="mt-2 w-[min(36rem,70vw)] rounded-lg border border-[#1F222F] bg-[#0D0E12] p-3">
                                <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-slate-300">{pitch}</pre>
                                <button type="button" onClick={() => void copyPitch(id, pitch)} className="mt-2 text-[10px] font-semibold text-lime-300 hover:text-lime-200">
                                  {copiedPitch === id ? 'Copied' : 'Copy Markdown'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {report.sponsorshipMatches.map((match, index) => {
                  const id = `${match.targetBrandCategory}-${index}`;
                  const pitch = sponsorshipPitch(match, location);
                  return (
                    <li key={id} className="rounded-lg border border-[#1F222F] bg-[#0D0E12] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-xs font-semibold text-white">{match.targetBrandCategory}</h4>
                        <span className={`text-xs font-bold ${match.audienceAffinityMatchPct > 85 ? 'text-lime-300' : 'text-indigo-200'}`}>
                          {match.audienceAffinityMatchPct}/100
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{match.justification}</p>
                      <button
                        type="button"
                        onClick={() => setExpandedPitch(expandedPitch === id ? null : id)}
                        className="mt-3 rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-200"
                      >
                        {expandedPitch === id ? 'Hide Executive Pitch' : 'Generate Executive Pitch Deck'}
                      </button>
                      {expandedPitch === id && (
                        <div className="mt-2 rounded-lg border border-[#1F222F] p-3">
                          <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-slate-300">{pitch}</pre>
                          <button type="button" onClick={() => void copyPitch(id, pitch)} className="mt-2 text-[10px] font-semibold text-lime-300">
                            {copiedPitch === id ? 'Copied' : 'Copy Markdown'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="mt-3 text-[10px] text-slate-500">
            Affinity scores are modeled cultural-fit indicators, not verified conversion or sponsorship commitments.
          </p>
        </div>
      </section>

      {tags.length > 0 && <p className="text-[9px] text-slate-600">Analysis grounded in {tags.length} supplied cultural descriptors.</p>}
    </section>
  );
}
