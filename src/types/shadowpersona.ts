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

export const simulationResponseSchema = z.object({
  summary: z.string(),
  evidence: z.array(qlooEvidenceSchema),
  report: z.string(),
  sources: z.array(researchSourceSchema),
  mode: z.enum(['live', 'fixture']).optional(),
});

export type QlooEvidence = z.infer<typeof qlooEvidenceSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;
