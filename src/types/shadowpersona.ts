import { z } from 'zod';

export type TargetVertical = 'music' | 'hospitality';

export const qlooEvidenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  affinity: z.number().min(0).max(100).nullable(),
  description: z.string().nullable(),
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
      .array(z.object({ name: z.string(), price: z.number().nonnegative(), note: z.string().optional() }))
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
    estimatedLtvMultiplier: z.number().positive(),
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

export const promoterLocationSchema = z.enum([
  'San Francisco, CA',
  'Oakland, CA',
  'Los Angeles, CA',
  'New York, NY',
  'London, UK',
]);
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
  report: z.string(),
  sources: z.array(researchSourceSchema),
  resolvedTags: z.array(z.string()).optional(),
  comparison: comparativeAnalysisSchema.optional(),
  comparisonStatus: z.enum(['complete', 'skipped', 'failed']).optional(),
  optimization: optimizationDataSchema.optional(),
  promoterROI: promoterROIDataSchema.optional(),
  promoterROIStatus: z.enum(['complete', 'failed', 'skipped']).optional(),
  mode: z.enum(['live', 'fixture']).optional(),
});

export type QlooEvidence = z.infer<typeof qlooEvidenceSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;
export type ComparativeAnalysis = z.infer<typeof comparativeAnalysisSchema>;
