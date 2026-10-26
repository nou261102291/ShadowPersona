const baseUrl = 'https://hackathon.api.qloo.com';
const apiKey = process.env.QLOO_API_KEY;

if (!apiKey || apiKey.startsWith('replace-')) {
  console.error('Qloo smoke test cannot run: set QLOO_API_KEY in .env.local.');
  process.exit(1);
}

async function qlooGet(path, params) {
  const url = new URL(path, baseUrl);
  url.search = new URLSearchParams(params).toString();
  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'network request failed';
    throw new Error(`${path}: ${reason}.`);
  }

  if (!response.ok) {
    throw new Error(`${path}: Qloo returned HTTP ${response.status}; response body and credentials were suppressed.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${path}: Qloo returned invalid JSON; response body was suppressed.`);
  }
}

function summarizeInsight(type, payload) {
  const entities = payload?.results?.entities;
  if (!Array.isArray(entities)) {
    throw new Error(`${type}: response did not contain a results.entities array.`);
  }
  const withIds = entities.filter((entity) => typeof entity.entity_id === 'string');
  const withAffinity = entities.filter((entity) => typeof entity.query?.affinity === 'number');
  const withExplainability = entities.filter(
    (entity) => entity.query?.explainability !== undefined && entity.query?.explainability !== null,
  );
  const affinityValues = withAffinity.map((entity) => entity.query.affinity);
  const affinityRange = affinityValues.length
    ? `${Math.min(...affinityValues)} to ${Math.max(...affinityValues)}`
    : 'not returned';

  console.log(
    `${type}: ${entities.length} entities; IDs ${withIds.length}; raw affinity values ${withAffinity.length}; explainability objects ${withExplainability.length}; raw affinity range ${affinityRange}.`,
  );
  if (entities[0]) console.log(`  Example Qloo entity: ${entities[0].name || '(unnamed)'}.`);
  if (entities.length === 0) console.log('  Qloo returned no matches for this generic test tag.');
  if (entities.length > 0 && withExplainability.length === 0) {
    console.log('  Qloo returned no per-entity explainability object; the UI should state this explicitly.');
  }
}

try {
  console.log('Qloo smoke test: generic cultural cue "jazz" (no user brief or personal data).');
  let tagPayload = await qlooGet('/v2/tags', {
    'filter.query': 'jazz',
    'filter.parents.types': 'urn:entity:artist',
    take: '2',
  });
  let tags = tagPayload?.results?.tags;
  if (!Array.isArray(tags)) throw new Error('/v2/tags: response did not contain a results.tags array.');

  if (tags.length === 0) {
    tagPayload = await qlooGet('/v2/tags', { 'filter.query': 'jazz', take: '2' });
    tags = tagPayload?.results?.tags;
    if (!Array.isArray(tags)) throw new Error('/v2/tags: fallback response did not contain a results.tags array.');
  }
  if (tags.length === 0) {
    console.log('Tag resolution succeeded but found no tags for "jazz"; insights were not requested.');
    process.exitCode = 2;
  } else {
    console.log(`Tag mapping: ${tags.length} result(s): ${tags.map((tag) => tag.name).join(', ')}.`);
    const tagIds = tags.map((tag) => tag.id).filter((id) => typeof id === 'string' && id.length > 0);
    if (tagIds.length === 0) throw new Error('/v2/tags: results did not contain usable tag IDs.');

    for (const type of ['artist', 'brand']) {
      const payload = await qlooGet('/v2/insights', {
        'filter.type': `urn:entity:${type}`,
        'signal.interests.tags': tagIds.join(','),
        'feature.explainability': 'true',
        take: '5',
      });
      summarizeInsight(type, payload);
    }
  }
} catch (error) {
  console.error(`Qloo smoke test failed: ${error instanceof Error ? error.message : 'unexpected provider error'}`);
  process.exitCode = 1;
}
