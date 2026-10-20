// Purges stale offline-replay fixtures from resources/demo/fixtures.
// Usage: node scripts/purge-demo-cache.mjs [--all] [--dry-run] [--max-age-days=30]
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(root, 'resources', 'demo');
const fixturesDir = path.join(demoDir, 'fixtures');

const args = process.argv.slice(2);
const purgeAll = args.includes('--all');
const dryRun = args.includes('--dry-run');
const ageArg = args.find((arg) => arg.startsWith('--max-age-days='));
const maxAgeDays = ageArg ? Number(ageArg.split('=')[1]) : 30;
if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
  console.error('--max-age-days must be a non-negative number.');
  process.exit(1);
}

const manifest = JSON.parse(await fs.readFile(path.join(demoDir, 'manifest.json'), 'utf8'));
const knownIds = new Set(manifest.map((scenario) => scenario.id));

let names = [];
try {
  names = (await fs.readdir(fixturesDir)).filter((name) => name.endsWith('.json'));
} catch {
  console.log('No fixtures directory; nothing to purge.');
  process.exit(0);
}

function staleReason(id, raw, mtimeMs) {
  if (purgeAll) return 'requested (--all)';
  if (!knownIds.has(id)) return 'scenario no longer in manifest';
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'invalid JSON';
  }
  const hasCore =
    typeof data.summary === 'string' &&
    typeof data.report === 'string' &&
    Array.isArray(data.evidence) &&
    Array.isArray(data.sources);
  if (!hasCore) return 'does not match the response schema';
  if (!data.comparison) return 'predates the comparison stage';
  const ageDays = (Date.now() - mtimeMs) / 86_400_000;
  if (ageDays > maxAgeDays) return `older than ${maxAgeDays} days`;
  return null;
}

let purged = 0;
for (const name of names) {
  const file = path.join(fixturesDir, name);
  const [raw, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
  const reason = staleReason(name.slice(0, -5), raw, stat.mtimeMs);
  if (!reason) continue;
  purged++;
  console.log(`${dryRun ? 'would remove' : 'removed'} ${name}: ${reason}`);
  if (!dryRun) await fs.rm(file);
}
console.log(`${purged} of ${names.length} fixtures ${dryRun ? 'would be ' : ''}purged.`);
