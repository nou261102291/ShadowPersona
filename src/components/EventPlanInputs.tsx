'use client';

import type { ChangeEvent } from 'react';
import type { EventPlan } from '@/types/shadowpersona';

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-medium text-slate-400">{label}</span>
      <input
        className="h-8 w-full rounded-md border border-white/[0.08] bg-[#15171d] px-2.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/60"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = '1',
  prefix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: string;
  prefix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-medium text-slate-400">{label}</span>
      <div className="flex h-8 items-center rounded-md border border-white/[0.08] bg-[#15171d] focus-within:border-blue-500/60">
        {prefix && <span className="pl-2.5 text-[10px] text-slate-500">{prefix}</span>}
        <input
          className="h-full min-w-0 w-full bg-transparent px-2.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600"
          type="number"
          min="0"
          step={step}
          value={value ?? ''}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const nextValue = event.target.value;
            onChange(nextValue === '' ? null : Number(nextValue));
          }}
        />
      </div>
    </label>
  );
}

export default function EventPlanInputs({
  plan,
  onChange,
}: {
  plan: EventPlan;
  onChange: (plan: EventPlan) => void;
}) {
  const set = <K extends keyof EventPlan>(key: K, value: EventPlan[K]) => {
    onChange({ ...plan, [key]: value });
  };

  return (
    <details className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.035]">
      <summary className="cursor-pointer list-none px-3.5 py-3">
        <span className="text-[11px] font-semibold text-slate-200">Event organizer plan</span>
        <span className="ml-2 text-[9px] text-violet-300">culture · audience · economics</span>
      </summary>
      <div className="space-y-4 border-t border-white/[0.06] p-3.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-medium text-slate-400">Event format</span>
            <select
              className="h-8 w-full rounded-md border border-white/[0.08] bg-[#15171d] px-2 text-[10px] text-slate-200 outline-none focus:border-blue-500/60"
              value={plan.eventType}
              onChange={(event) => {
                if (event.target.value === 'concert-tour' || event.target.value === 'music-festival' || event.target.value === 'comedy-show') {
                  set('eventType', event.target.value);
                }
              }}
            >
              <option value="concert-tour">Concert / tour</option>
              <option value="music-festival">Music festival</option>
              <option value="comedy-show">Comedy show / tour</option>
            </select>
          </label>
          <TextInput
            label="Demo / event label"
            value={plan.demoLabel}
            placeholder="Optional"
            onChange={(value) => set('demoLabel', value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TextInput
            label="Organizer"
            value={plan.organizerName}
            placeholder="Organizer or brand"
            onChange={(value) => set('organizerName', value)}
          />
          <TextInput
            label="Headliner / featured talent"
            value={plan.featuredTalent}
            placeholder="Acts or comedians"
            onChange={(value) => set('featuredTalent', value)}
          />
        </div>
        <TextInput
          label="Hosts / anchors"
          value={plan.hosts}
          placeholder="Names or roles"
          onChange={(value) => set('hosts', value)}
        />
        <label className="block">
          <span className="mb-1 block text-[9px] font-medium text-slate-400">Intended tone</span>
          <textarea
            className="min-h-14 w-full resize-y rounded-md border border-white/[0.08] bg-[#15171d] p-2.5 text-[10px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/60"
            maxLength={300}
            value={plan.tone}
            placeholder="e.g. theatrical, celebratory, family-friendly, irreverent"
            onChange={(event) => set('tone', event.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-medium text-slate-400">Event date</span>
            <input
              className="h-8 w-full rounded-md border border-white/[0.08] bg-[#15171d] px-2.5 text-[10px] text-slate-200 outline-none focus:border-blue-500/60"
              type="date"
              value={plan.eventDate ?? ''}
              onChange={(event) => set('eventDate', event.target.value || null)}
            />
          </label>
          <TextInput
            label="City / market"
            value={plan.location}
            placeholder="To be decided"
            onChange={(value) => set('location', value)}
          />
          <TextInput
            label="Venue"
            value={plan.venueName}
            placeholder="Venue TBD"
            onChange={(value) => set('venueName', value)}
          />
          <NumberInput
            label="Venue capacity"
            value={plan.venueCapacity}
            onChange={(value) => set('venueCapacity', value)}
          />
          <NumberInput
            label="Local aggregate audience reach"
            value={plan.localAudienceReach}
            onChange={(value) => set('localAudienceReach', value)}
          />
        </div>
        <p className="text-[9px] leading-relaxed text-slate-500">
          Use authorized, aggregate reach only. Public research is contextual, not a count of identifiable fans or guaranteed buyers.
        </p>

        <div>
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Attendance conversion assumptions (% of local reach)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="Low" value={plan.conversionLowPct} step="0.1" onChange={(value) => set('conversionLowPct', value)} />
            <NumberInput
              label="Expected"
              value={plan.conversionExpectedPct}
              step="0.1"
              onChange={(value) => set('conversionExpectedPct', value)}
            />
            <NumberInput label="High" value={plan.conversionHighPct} step="0.1" onChange={(value) => set('conversionHighPct', value)} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Ticketing &amp; additional revenue</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="General admission ticket"
              value={plan.generalTicketPriceUsd}
              prefix="$"
              step="0.01"
              onChange={(value) => set('generalTicketPriceUsd', value)}
            />
            <NumberInput
              label="VIP ticket"
              value={plan.vipTicketPriceUsd}
              prefix="$"
              step="0.01"
              onChange={(value) => set('vipTicketPriceUsd', value)}
            />
            <NumberInput label="VIP share of attendance" value={plan.vipSharePct} step="0.1" onChange={(value) => set('vipSharePct', value)} />
            <NumberInput
              label="Ticketing fee"
              value={plan.ticketingFeePct}
              step="0.1"
              onChange={(value) => set('ticketingFeePct', value)}
            />
            <NumberInput
              label="Sponsorship revenue"
              value={plan.sponsorshipRevenueUsd}
              prefix="$"
              step="1000"
              onChange={(value) => set('sponsorshipRevenueUsd', value)}
            />
            <NumberInput
              label="Merch revenue / attendee"
              value={plan.merchandiseRevenuePerAttendeeUsd}
              prefix="$"
              step="0.01"
              onChange={(value) => set('merchandiseRevenuePerAttendeeUsd', value)}
            />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Fixed costs &amp; operations</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Venue" value={plan.venueCostUsd} prefix="$" step="1000" onChange={(value) => set('venueCostUsd', value)} />
            <NumberInput label="Talent" value={plan.talentCostUsd} prefix="$" step="1000" onChange={(value) => set('talentCostUsd', value)} />
            <NumberInput
              label="Production / crew"
              value={plan.productionCostUsd}
              prefix="$"
              step="1000"
              onChange={(value) => set('productionCostUsd', value)}
            />
            <NumberInput
              label="Staffing / security"
              value={plan.staffingSecurityCostUsd}
              prefix="$"
              step="1000"
              onChange={(value) => set('staffingSecurityCostUsd', value)}
            />
            <NumberInput
              label="Marketing"
              value={plan.marketingCostUsd}
              prefix="$"
              step="1000"
              onChange={(value) => set('marketingCostUsd', value)}
            />
            <NumberInput label="Travel" value={plan.travelCostUsd} prefix="$" step="1000" onChange={(value) => set('travelCostUsd', value)} />
            <NumberInput
              label="Other fixed cost"
              value={plan.otherFixedCostUsd}
              prefix="$"
              step="1000"
              onChange={(value) => set('otherFixedCostUsd', value)}
            />
            <NumberInput
              label="Variable cost / attendee"
              value={plan.variableCostPerAttendeeUsd}
              prefix="$"
              step="0.01"
              onChange={(value) => set('variableCostPerAttendeeUsd', value)}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.04] p-2.5 text-[9px] leading-relaxed text-amber-100">
          <input
            className="mt-0.5 accent-amber-400"
            type="checkbox"
            checked={plan.sampleAssumptions}
            onChange={(event) => set('sampleAssumptions', event.target.checked)}
          />
          <span>These are illustrative sample assumptions, not real sales, audience, artist fee, or venue quote data.</span>
        </label>
      </div>
    </details>
  );
}
