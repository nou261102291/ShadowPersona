import { z } from 'zod';
import manifest from '../../resources/demo/manifest.json';

export const demoScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  subtitle: z.string(),
  icon: z.string(),
  description: z.string(),
  vertical: z.enum(['music', 'hospitality']),
  tags: z.string(),
  sourceUrl: z.string(),
  file: z.string().regex(/^[\w.-]*$/),
  rationale: z.string(),
});

export type DemoScenario = z.infer<typeof demoScenarioSchema>;

export const DEMO_SCENARIOS: DemoScenario[] = z.array(demoScenarioSchema).parse(manifest);

export function findDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id);
}
