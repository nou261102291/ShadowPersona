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
  comparison: comparativeAnalysisSchema.optional(),
  mode: z.enum(['live', 'fixture']).optional(),
});

export type QlooEvidence = z.infer<typeof qlooEvidenceSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;
export type ComparativeAnalysis = z.infer<typeof comparativeAnalysisSchema>;
