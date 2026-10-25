import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evaluationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'evaluation');
const caseStyles = [
  ['jazz fusion', 'modal jazz, improvisation, and electric textures'],
  ['neo-soul', 'warm vocals, intimate arrangements, and analog production'],
  ['indie rock', 'guitar-led songwriting, dream pop, and atmospheric production'],
  ['Afrobeats', 'contemporary West African pop, rhythmic energy, and dance'],
  ['ambient electronic', 'slow textures, visual art, and an attentive listening environment'],
  ['Americana', 'acoustic songwriting, roots music, and a relaxed outdoor setting'],
  ['punk and hardcore', 'independent artists, high energy, and an all-ages community setting'],
  ['chamber music', 'small ensembles, contemporary composition, and an attentive audience'],
];
const eventFormats = [
  ['ticketed showcase', 'a 250-person independent venue'],
  ['community concert', 'a 700-person civic arts venue'],
  ['weekend festival stage', 'an outdoor event with a 1,500-person capacity'],
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function asObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  return value;
}

function makeTemplate() {
  const cases = caseStyles.flatMap(([style, cues], styleIndex) =>
    eventFormats.map(([format, venue], formatIndex) => {
      const number = styleIndex * eventFormats.length + formatIndex + 1;
      return {
        id: `S${String(number).padStart(2, '0')}`,
        brief: `Plan a ${format} at ${venue} for an audience interested in ${style}. Cultural cues: ${cues}. Suggest culturally relevant artists and potential brand categories; do not infer attendance or purchase intent from taste.`,
        culturalCues: [style, ...cues.split(', ')],
        qlooEvidenceIds: [],
        baseline: { text: '', namedEntities: [] },
        qlooGrounded: { text: '', namedEntities: [] },
      };
    }),
  );
  return {
    studyDescription: 'Synthetic event briefs for evaluator workflow setup. These are not real organizer interviews or measured model outputs.',
    cases,
  };
}

function validateStudy(study) {
  asObject(study, 'Study');
  assert(Array.isArray(study.cases) && study.cases.length >= 20, 'Study must contain at least 20 cases.');
  const ids = new Set();
  for (const [index, rawCase] of study.cases.entries()) {
    const item = asObject(rawCase, `Case ${index + 1}`);
    assert(typeof item.id === 'string' && item.id.trim(), `Case ${index + 1} needs an id.`);
    assert(!ids.has(item.id), `Duplicate case id: ${item.id}.`);
    ids.add(item.id);
    assert(typeof item.brief === 'string' && item.brief.trim(), `${item.id} needs a brief.`);
    assert(Array.isArray(item.qlooEvidenceIds), `${item.id}.qlooEvidenceIds must be an array.`);
    assert(item.qlooEvidenceIds.every((id) => typeof id === 'string' && id.trim()), `${item.id} has an invalid Qloo evidence id.`);
    for (const armName of ['baseline', 'qlooGrounded']) {
      const arm = asObject(item[armName], `${item.id}.${armName}`);
      assert(typeof arm.text === 'string' && arm.text.trim(), `${item.id}.${armName}.text must contain the candidate response.`);
      assert(Array.isArray(arm.namedEntities), `${item.id}.${armName}.namedEntities must be an array.`);
      for (const entity of arm.namedEntities) {
        assert(typeof entity.name === 'string' && entity.name.trim(), `${item.id}.${armName} contains an entity without a name.`);
        assert(
          entity.qlooEntityId === null || typeof entity.qlooEntityId === 'string',
          `${item.id}.${armName} entity Qloo IDs must be strings or null.`,
        );
      }
    }
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${file} is not valid JSON.`);
    fail(`Could not read ${file}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${file}`);
}

function makeBlindPacket(study) {
  const packetId = randomUUID();
  const keyCases = [];
  const packetCases = study.cases.map((item) => {
    const groundedOnA = randomInt(0, 2) === 0;
    const armA = groundedOnA ? item.qlooGrounded : item.baseline;
    const armB = groundedOnA ? item.baseline : item.qlooGrounded;
    keyCases.push({
      id: item.id,
      qlooEvidenceIds: item.qlooEvidenceIds,
      A: { method: groundedOnA ? 'qlooGrounded' : 'baseline', namedEntities: armA.namedEntities },
      B: { method: groundedOnA ? 'baseline' : 'qlooGrounded', namedEntities: armB.namedEntities },
    });
    return { id: item.id, brief: item.brief, responseA: armA.text, responseB: armB.text };
  });
  return {
    packet: { packetId, instructions: 'Review each pair without guessing which method generated it. Rate A and B independently before choosing a preference.', cases: packetCases },
    key: { packetId, cases: keyCases },
  };
}

function validateRating(value, label) {
  const rating = asObject(value, label);
  for (const field of ['culturalRelevance', 'evidenceSupport', 'actionability']) {
    assert(Number.isInteger(rating[field]) && rating[field] >= 1 && rating[field] <= 5, `${label}.${field} must be an integer from 1 to 5.`);
  }
  assert(
    Number.isInteger(rating.unsupportedEntityClaims) && rating.unsupportedEntityClaims >= 0,
    `${label}.unsupportedEntityClaims must be a non-negative integer.`,
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function scoreStudy(packet, key, ratingsFile) {
  assert(packet.packetId && packet.packetId === key.packetId, 'Reviewer packet and private answer key do not match.');
  assert(packet.packetId === ratingsFile.packetId, 'Ratings file does not match the reviewer packet.');
  assert(Array.isArray(packet.cases) && packet.cases.length >= 20, 'Reviewer packet must contain at least 20 cases.');
  assert(Array.isArray(key.cases) && key.cases.length === packet.cases.length, 'Answer key does not match the reviewer packet.');
  assert(Array.isArray(ratingsFile.reviewers), 'Ratings file must contain a reviewers array.');

  const reviewers = ratingsFile.reviewers;
  assert(reviewers.length >= 3 && reviewers.length <= 5, 'The study requires 3–5 independent reviewers.');
  const reviewerIds = new Set();
  const packetIds = new Set(packet.cases.map((item) => item.id));
  const keyByCase = new Map(key.cases.map((item) => [item.id, item]));
  const metrics = {
    baseline: { ratings: { culturalRelevance: [], evidenceSupport: [], actionability: [] }, unsupportedEntityClaims: 0, reviewedEntityClaims: 0, matchedEvidenceEntities: 0, namedEntities: 0 },
    qlooGrounded: { ratings: { culturalRelevance: [], evidenceSupport: [], actionability: [] }, unsupportedEntityClaims: 0, reviewedEntityClaims: 0, matchedEvidenceEntities: 0, namedEntities: 0 },
  };
  const preferences = { baseline: 0, qlooGrounded: 0, tie: 0 };

  for (const [reviewerIndex, reviewer] of reviewers.entries()) {
    asObject(reviewer, `Reviewer ${reviewerIndex + 1}`);
    assert(typeof reviewer.id === 'string' && reviewer.id.trim(), `Reviewer ${reviewerIndex + 1} needs an anonymous ID.`);
    assert(!reviewerIds.has(reviewer.id), `Duplicate reviewer ID: ${reviewer.id}.`);
    reviewerIds.add(reviewer.id);
    assert(Array.isArray(reviewer.ratings) && reviewer.ratings.length === packet.cases.length, `${reviewer.id} must rate every case.`);
    const ratedIds = new Set();

    for (const rating of reviewer.ratings) {
      assert(packetIds.has(rating.caseId), `${reviewer.id} rated unknown case ${rating.caseId}.`);
      assert(!ratedIds.has(rating.caseId), `${reviewer.id} rated ${rating.caseId} more than once.`);
      ratedIds.add(rating.caseId);
      assert(['A', 'B', 'tie'].includes(rating.preference), `${reviewer.id}/${rating.caseId} preference must be A, B, or tie.`);
      validateRating(rating.A, `${reviewer.id}/${rating.caseId}.A`);
      validateRating(rating.B, `${reviewer.id}/${rating.caseId}.B`);

      const answerCase = keyByCase.get(rating.caseId);
      assert(answerCase, `Answer key is missing ${rating.caseId}.`);
      for (const arm of ['A', 'B']) {
        const method = answerCase[arm].method;
        const target = metrics[method];
        for (const field of ['culturalRelevance', 'evidenceSupport', 'actionability']) {
          target.ratings[field].push(rating[arm][field]);
        }
        target.unsupportedEntityClaims += rating[arm].unsupportedEntityClaims;
        assert(
          Number.isInteger(rating[arm].namedEntityClaims) &&
            rating[arm].namedEntityClaims >= rating[arm].unsupportedEntityClaims,
          `${reviewer.id}/${rating.caseId}.${arm}.namedEntityClaims must be at least the unsupported claim count.`,
        );
        target.reviewedEntityClaims += rating[arm].namedEntityClaims;
      }

      if (rating.preference === 'tie') {
        preferences.tie++;
      } else {
        preferences[answerCase[rating.preference].method]++;
      }
    }
  }

  for (const caseInfo of key.cases) {
    for (const arm of ['A', 'B']) {
      const result = metrics[caseInfo[arm].method];
      const evidenceIds = new Set(caseInfo.qlooEvidenceIds);
      for (const entity of caseInfo[arm].namedEntities) {
        result.namedEntities++;
        if (entity.qlooEntityId && evidenceIds.has(entity.qlooEntityId)) result.matchedEvidenceEntities++;
      }
    }
  }

  const summarize = (result) => ({
    meanRatings: Object.fromEntries(
      Object.entries(result.ratings).map(([field, values]) => [
        field,
        values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
      ]),
    ),
    qlooEvidenceCoverage:
      result.namedEntities > 0 ? round(result.matchedEvidenceEntities / result.namedEntities) : null,
    namedEntities: result.namedEntities,
    unsupportedEntityClaims: result.unsupportedEntityClaims,
    reviewedEntityClaims: result.reviewedEntityClaims,
    unsupportedEntityClaimRate:
      result.reviewedEntityClaims > 0 ? round(result.unsupportedEntityClaims / result.reviewedEntityClaims) : null,
  });

  const totalPreferences = preferences.baseline + preferences.qlooGrounded + preferences.tie;
  return {
    packetId: packet.packetId,
    cases: packet.cases.length,
    independentReviewers: reviewerIds.size,
    preference: {
      baseline: preferences.baseline,
      qlooGrounded: preferences.qlooGrounded,
      tie: preferences.tie,
      qlooGroundedShareExcludingTies:
        totalPreferences > preferences.tie
          ? round(preferences.qlooGrounded / (totalPreferences - preferences.tie))
          : null,
    },
    baseline: summarize(metrics.baseline),
    qlooGrounded: summarize(metrics.qlooGrounded),
    note: 'Descriptive study metrics only; this report does not establish statistical significance or prove causality.',
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--') argv.shift();
  const [command, ...args] = argv;
  if (command === 'init') {
    const output = path.resolve(args[0] || path.join(evaluationDir, 'study-template.json'));
    await writeJson(output, makeTemplate());
    return;
  }
  if (command === 'prepare') {
    const [studyPath, packetPath, keyPath] = args;
    assert(studyPath && packetPath && keyPath, 'Usage: grounding-eval.mjs prepare <completed-study.json> <reviewer-packet.json> <private-answer-key.json>');
    const study = await readJson(path.resolve(studyPath));
    validateStudy(study);
    const { packet, key } = makeBlindPacket(study);
    await writeJson(path.resolve(packetPath), packet);
    await writeJson(path.resolve(keyPath), key);
    console.log('Share only the reviewer packet. Keep the private answer key away from reviewers until scoring.');
    return;
  }
  if (command === 'score') {
    const [packetPath, keyPath, ratingsPath, outputPath] = args;
    assert(packetPath && keyPath && ratingsPath, 'Usage: grounding-eval.mjs score <reviewer-packet.json> <private-answer-key.json> <ratings.json> [report.json]');
    const [packet, key, ratings] = await Promise.all([
      readJson(path.resolve(packetPath)),
      readJson(path.resolve(keyPath)),
      readJson(path.resolve(ratingsPath)),
    ]);
    const report = scoreStudy(packet, key, ratings);
    const output = outputPath ? path.resolve(outputPath) : null;
    if (output) await writeJson(output, report);
    else console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log([
    'Offline Qloo-grounding study helper (no provider calls).',
    '  node scripts/grounding-eval.mjs init [study-template.json]',
    '  node scripts/grounding-eval.mjs prepare <completed-study.json> <reviewer-packet.json> <private-answer-key.json>',
    '  node scripts/grounding-eval.mjs score <reviewer-packet.json> <private-answer-key.json> <ratings.json> [report.json]',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Evaluation workflow failed.');
  process.exitCode = 1;
});
