import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simulationResponseSchema, type SimulationResponse } from '@/types/shadowpersona';
import { findDemoScenario } from './demoScenarios';
import { getAnalysisModelProviderLabel, isAnalysisModelConfigured } from './providers/modelConfig';

const demoDir = path.join(process.cwd(), 'resources', 'demo');

export function providerStatus() {
  const has = (name: string) => {
    const value = process.env[name];
    return Boolean(value) && !value!.startsWith('replace-');
  };
  return {
    qloo: has('QLOO_API_KEY'),
    analysisModel: isAnalysisModelConfigured(),
    analysisProvider: getAnalysisModelProviderLabel(),
    tavily: has('TAVILY_API_KEY'),
  };
}

export async function readDemoFile(id: string): Promise<{ name: string; bytes: Buffer } | null> {
  const scenario = findDemoScenario(id);
  if (!scenario?.file) return null;
  try {
    const bytes = await fs.readFile(path.join(demoDir, scenario.file));
    // A Git LFS pointer or truncated checkout is not a PDF; fail loudly instead of uploading junk.
    if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') return null;
    return { name: scenario.file, bytes };
  } catch {
    return null;
  }
}

export async function readFixture(id: string): Promise<SimulationResponse | null> {
  if (!findDemoScenario(id)) return null;
  try {
    const raw = await fs.readFile(path.join(demoDir, 'fixtures', `${id}.json`), 'utf8');
    const parsed = simulationResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listFixtureIds(): Promise<string[]> {
  try {
    const names = await fs.readdir(path.join(demoDir, 'fixtures'));
    return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
  } catch {
    return [];
  }
}

export async function recordFixture(id: string, response: SimulationResponse): Promise<void> {
  if (!findDemoScenario(id)) return;
  await fs.writeFile(path.join(demoDir, 'fixtures', `${id}.json`), `${JSON.stringify(response, null, 2)}\n`);
}
