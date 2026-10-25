import { z } from 'zod';

export type TargetVertical = 'music' | 'hospitality';

export const eventTypeSchema = z.enum(['concert-tour', 'music-festival', 'comedy-show']);
export type EventType = z.infer<typeof eventTypeSchema>;

const optionalCount = z.number().int().min(0).max(100_000_000).nullable();
const optionalMoney = z.number().min(0).max(1_000_000_000).nullable();
const optionalPerUnitMoney = z.number().min(0).max(100_000).nullable();
const optionalPercentage = z.number().min(0).max(100).nullable();

export const eventPlanSchema = z.object({
  demoLabel: z.string().trim().max(120).default(''),
  eventType: eventTypeSchema.default('concert-tour'),
  organizerName: z.string().trim().max(120).default(''),
  featuredTalent: z.string().trim().max(300).default(''),
  hosts: z.string().trim().max(300).default(''),
  tone: z.string().trim().max(300).default(''),
  eventDate: z.iso.date().nullable().default(null),
  location: z.string().trim().max(120).default(''),
  venueName: z.string().trim().max(120).default(''),
  venueCapacity: z.number().int().min(1).max(500_000).nullable().default(null),
  localAudienceReach: optionalCount.default(null),
  conversionLowPct: optionalPercentage.default(null),
  conversionExpectedPct: optionalPercentage.default(null),
  conversionHighPct: optionalPercentage.default(null),
  generalTicketPriceUsd: optionalPerUnitMoney.default(null),
  vipTicketPriceUsd: optionalPerUnitMoney.default(null),
  vipSharePct: optionalPercentage.default(null),
  sponsorshipRevenueUsd: optionalMoney.default(null),
  merchandiseRevenuePerAttendeeUsd: optionalPerUnitMoney.default(null),
  ticketingFeePct: optionalPercentage.default(null),
  venueCostUsd: optionalMoney.default(null),
  talentCostUsd: optionalMoney.default(null),
  productionCostUsd: optionalMoney.default(null),
  staffingSecurityCostUsd: optionalMoney.default(null),
  marketingCostUsd: optionalMoney.default(null),
  travelCostUsd: optionalMoney.default(null),
  otherFixedCostUsd: optionalMoney.default(null),
  variableCostPerAttendeeUsd: optionalPerUnitMoney.default(null),
  sampleAssumptions: z.boolean().default(false),
}).superRefine((plan, context) => {
  if (
    plan.conversionLowPct !== null &&
    plan.conversionExpectedPct !== null &&
    plan.conversionLowPct > plan.conversionExpectedPct
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Low conversion must not exceed expected conversion.',
      path: ['conversionLowPct'],
    });
  }
  if (
    plan.conversionExpectedPct !== null &&
    plan.conversionHighPct !== null &&
    plan.conversionExpectedPct > plan.conversionHighPct
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Expected conversion must not exceed high conversion.',
      path: ['conversionHighPct'],
    });
  }
});
export type EventPlan = z.infer<typeof eventPlanSchema>;

const forecastScenarioSchema = z.object({
  label: z.enum(['Low', 'Expected', 'High']),
  attendance: z.number().int().nonnegative(),
  ticketRevenueUsd: z.number().nonnegative(),
  sponsorshipRevenueUsd: z.number().nonnegative(),
  merchandiseRevenueUsd: z.number().nonnegative(),
  totalRevenueUsd: z.number().nonnegative(),
  fixedCostsUsd: z.number().nonnegative(),
  variableCostsUsd: z.number().nonnegative(),
  ticketingFeesUsd: z.number().nonnegative(),
  totalCostsUsd: z.number().nonnegative(),
  operatingProfitUsd: z.number(),
  operatingMarginPct: z.number().nullable(),
});

export const eventForecastSchema = z.object({
  label: z.string().max(120),
  sampleAssumptions: z.boolean(),
  venueCapacity: z.number().int().positive().nullable(),
  breakEvenAttendance: z.number().int().nonnegative().nullable(),
  breakEvenWithinCapacity: z.boolean().nullable(),
  scenarios: z.array(forecastScenarioSchema).length(3),
});
export type EventForecast = z.infer<typeof eventForecastSchema>;

export const qlooEvidenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  affinity: z.number().min(0).max(100).nullable(),
  description: z.string().nullable(),
  explainability: z.record(z.string(), z.unknown()).optional(),
});

export const researchSourceSchema = z.object({
  title: z.string(),
  url: z.url(),
});

// Only http(s) links may reach clickable anchors; z.url() alone also accepts javascript: and data: URLs.
export const httpUrlSchema = z.url().refine((value) => /^https?:\/\//i.test(value), 'Only http(s) URLs are allowed.');

export const competitiveBenchmarkSchema = z.object({
  title: z.string(),
  url: httpUrlSchema,
  snippet: z.string(),
});

export const geminiOptimizationSchema = z.object({
  preEventOptimization: z.object({
    recommendedTicketPricingTiers: z
      .array(z.object({ name: z.string(), price: z.number().nonnegative().nullable(), note: z.string().optional() }))
      .min(1)
      .max(6),
    marketingChannelMix: z
      .array(z.object({ channel: z.string(), allocationPct: z.number().min(0).max(100) }))
      .min(1)
      .max(8),
    primaryOperationalRisk: z.string(),
  }),
  postEventOptimization: z.object({
    audienceRetentionStrategy: z.string(),
    estimatedLtvMultiplier: z.number().positive().nullable(),
    downstreamBrandPartnershipSuggestions: z.array(z.string()).min(1).max(8),
  }),
  geminiRationale: z.string(),
});

export const optimizationDataSchema = geminiOptimizationSchema.extend({
  competitiveBenchmarks: z.array(competitiveBenchmarkSchema),
  comparisonStatus: z.enum(['complete', 'failed', 'skipped']),
});

export type OptimizationData = z.infer<typeof optimizationDataSchema>;
export type CompetitiveBenchmark = z.infer<typeof competitiveBenchmarkSchema>;

export const promoterLocationSchema = z.string().trim().min(2).max(120);
export type PromoterLocation = z.infer<typeof promoterLocationSchema>;

export const promoterROIDataSchema = z.object({
  location: promoterLocationSchema,
  comparisonStatus: z.enum(['complete', 'failed', 'skipped']),
  talentProfiles: z.array(
    z.object({
      artistId: z.string(),
      artistName: z.string(),
      lossProtectionCoefficientPct: z.number().int().min(0).max(100),
      fanProfileAlignmentPct: z.number().int().min(0).max(100),
      localVenueDemographicAlignmentPct: z.number().int().min(0).max(100),
      alignmentBreakdown: z.array(
        z.object({
          dimension: z.string(),
          alignmentPct: z.number().int().min(0).max(100),
        }),
      ).min(1).max(6),
    }),
  ).min(1).max(12),
  pricing: z.object({
    optimalGeneralAdmissionTierUsd: z.number().positive(),
    generalAdmissionTrendPct: z.number().min(-100).max(100),
    localCompetitorAverageUsd: z.number().positive().nullable(),
    localCompetitorSourceUrl: httpUrlSchema.nullable(),
    vipPremiumCeilingTierUsd: z.number().positive(),
    vipTrendPct: z.number().min(-100).max(100),
    attendeeMarginOptimizationPct: z.number().int().min(0).max(100),
    supplyDemandCurve: z.array(
      z.object({
        priceUsd: z.number().positive(),
        demandIndex: z.number().int().min(0).max(100),
      }),
    ).min(2).max(8),
  }),
  sponsorshipMatches: z.array(
    z.object({
      targetBrandCategory: z.string(),
      audienceAffinityMatchPct: z.number().int().min(0).max(100),
      justification: z.string(),
    }),
  ).max(10),
  competitiveBenchmarks: z.array(competitiveBenchmarkSchema),
});

export type PromoterROIData = z.infer<typeof promoterROIDataSchema>;

export const comparativeAnalysisSchema = z.object({
  comparativeAnalysis: z.object({
    historicalBenchmarkEventName: z.string(),
    varianceMetrics: z.object({
      audienceAffinityShift: z.number().min(-1).max(1),
      projectedYieldDifferential: z.string(),
      riskFactorMitigationIndex: z.number().int().min(0).max(100),
    }),
    sideBySideComparisonTable: z.array(
      z.object({
        metricTracked: z.string(),
        currentTargetProjected: z.union([z.number(), z.string()]),
        historicalBenchmarkActual: z.union([z.number(), z.string()]),
      }),
    ),
  }),
  informedStrategicAnalysis: z.object({
    coreVulnerabilityVerdict: z.string(),
    marketArbitrageOpportunity: z.string(),
    tacticalExecutionDirectives: z.array(z.string()).min(3),
  }),
});

export const simulationResponseSchema = z.object({
  summary: z.string(),
  evidence: z.array(qlooEvidenceSchema),
  brandEvidence: z.array(qlooEvidenceSchema).optional(),
  brandEvidenceStatus: z.enum(['complete', 'empty', 'failed']).optional(),
  report: z.string(),
  sources: z.array(researchSourceSchema),
  resolvedTags: z.array(z.string()).optional(),
  comparison: comparativeAnalysisSchema.optional(),
  comparisonStatus: z.enum(['complete', 'skipped', 'failed']).optional(),
  optimization: optimizationDataSchema.optional(),
  promoterROI: promoterROIDataSchema.optional(),
  promoterROIStatus: z.enum(['complete', 'failed', 'skipped']).optional(),
  eventForecast: eventForecastSchema.optional(),
  mode: z.enum(['live', 'fixture']).optional(),
});

export type QlooEvidence = z.infer<typeof qlooEvidenceSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;
export type ComparativeAnalysis = z.infer<typeof comparativeAnalysisSchema>;
