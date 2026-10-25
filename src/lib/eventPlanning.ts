import type { EventForecast, EventPlan } from '@/types/shadowpersona';

const MAX_SAFE_FORECAST = 1_000_000_000;

export function hasEventPlanningInput(plan: EventPlan): boolean {
  return Object.entries(plan).some(([key, value]) => {
    if (key === 'eventType' || key === 'sampleAssumptions') return false;
    return typeof value === 'string' ? Boolean(value.trim()) : value !== null;
  });
}

function sumFixedCosts(plan: EventPlan): number | null {
  const costs = [
    plan.venueCostUsd,
    plan.talentCostUsd,
    plan.productionCostUsd,
    plan.staffingSecurityCostUsd,
    plan.marketingCostUsd,
    plan.travelCostUsd,
    plan.otherFixedCostUsd,
  ];
  if (costs.some((cost) => cost === null)) return null;
  return costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
}

export function calculateEventForecast(plan: EventPlan): EventForecast | undefined {
  const required = [
    plan.localAudienceReach,
    plan.conversionLowPct,
    plan.conversionExpectedPct,
    plan.conversionHighPct,
    plan.generalTicketPriceUsd,
    plan.vipTicketPriceUsd,
    plan.vipSharePct,
    plan.sponsorshipRevenueUsd,
    plan.merchandiseRevenuePerAttendeeUsd,
    plan.ticketingFeePct,
    plan.variableCostPerAttendeeUsd,
  ];
  const fixedCostsUsd = sumFixedCosts(plan);
  if (required.some((value) => value === null) || fixedCostsUsd === null) return undefined;

  const localAudienceReach = plan.localAudienceReach ?? 0;
  const vipShare = (plan.vipSharePct ?? 0) / 100;
  const averageTicketPrice =
    (plan.generalTicketPriceUsd ?? 0) * (1 - vipShare) +
    (plan.vipTicketPriceUsd ?? 0) * vipShare;
  const ticketFeeRate = (plan.ticketingFeePct ?? 0) / 100;
  const contributionPerAttendee =
    averageTicketPrice * (1 - ticketFeeRate) +
    (plan.merchandiseRevenuePerAttendeeUsd ?? 0) -
    (plan.variableCostPerAttendeeUsd ?? 0);
  const breakEvenValue =
    contributionPerAttendee > 0
      ? Math.ceil(Math.max(0, fixedCostsUsd - (plan.sponsorshipRevenueUsd ?? 0)) / contributionPerAttendee)
      : null;
  const breakEvenAttendance =
    breakEvenValue !== null && breakEvenValue <= MAX_SAFE_FORECAST ? breakEvenValue : null;
  const scenarios = [
    { label: 'Low' as const, conversionPct: plan.conversionLowPct ?? 0 },
    { label: 'Expected' as const, conversionPct: plan.conversionExpectedPct ?? 0 },
    { label: 'High' as const, conversionPct: plan.conversionHighPct ?? 0 },
  ].map(({ label, conversionPct }) => {
    const unconstrainedAttendance = Math.round((localAudienceReach * conversionPct) / 100);
    const attendance = Math.min(plan.venueCapacity ?? unconstrainedAttendance, unconstrainedAttendance);
    const ticketRevenueUsd = attendance * averageTicketPrice;
    const sponsorshipRevenueUsd = plan.sponsorshipRevenueUsd ?? 0;
    const merchandiseRevenueUsd = attendance * (plan.merchandiseRevenuePerAttendeeUsd ?? 0);
    const totalRevenueUsd = ticketRevenueUsd + sponsorshipRevenueUsd + merchandiseRevenueUsd;
    const variableCostsUsd = attendance * (plan.variableCostPerAttendeeUsd ?? 0);
    const ticketingFeesUsd = ticketRevenueUsd * ticketFeeRate;
    const totalCostsUsd = fixedCostsUsd + variableCostsUsd + ticketingFeesUsd;
    const operatingProfitUsd = totalRevenueUsd - totalCostsUsd;

    return {
      label,
      attendance,
      ticketRevenueUsd,
      sponsorshipRevenueUsd,
      merchandiseRevenueUsd,
      totalRevenueUsd,
      fixedCostsUsd,
      variableCostsUsd,
      ticketingFeesUsd,
      totalCostsUsd,
      operatingProfitUsd,
      operatingMarginPct: totalRevenueUsd > 0 ? (operatingProfitUsd / totalRevenueUsd) * 100 : null,
    };
  });

  return {
    label: plan.demoLabel || plan.eventType.replaceAll('-', ' '),
    sampleAssumptions: plan.sampleAssumptions,
    venueCapacity: plan.venueCapacity,
    breakEvenAttendance,
    breakEvenWithinCapacity:
      breakEvenAttendance === null || plan.venueCapacity === null
        ? null
        : breakEvenAttendance <= plan.venueCapacity,
    scenarios,
  };
}
