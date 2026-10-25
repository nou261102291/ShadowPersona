import { z } from 'zod';
import type { QlooEvidence } from '@/types/shadowpersona';
import { fetchWithBackoff, requireEnv } from './http';

const tagsSchema = z.object({
  results: z.object({
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

const insightsSchema = z.object({
  results: z.object({
    entities: z.array(
      z.object({
        name: z.string(),
        entity_id: z.string(),
        subtype: z.string().optional(),
        properties: z.object({ description: z.string().nullish() }).passthrough().optional(),
        query: z
          .object({
            affinity: z.number().nullish(),
            explainability: z.record(z.string(), z.unknown()).nullish(),
          })
          .passthrough()
          .optional(),
      }),
    ),
  }),
});

async function qlooGet(path: string, params: Record<string, string>) {
  const base = requireEnv('QLOO_HACKATHON_API_SERVER_URL').replace(/\/$/, '');
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  const response = await fetchWithBackoff('Qloo', url, {
    headers: { 'X-Api-Key': requireEnv('QLOO_API_KEY') },
  });
  return response.json();
}

export async function resolveTagIds(tags: string[]): Promise<{ id: string; name: string }[]> {
  const unique = new Map<string, { id: string; name: string }>();
  const cleanTags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

  const pendingTags = [...cleanTags];
  const workerCount = Math.min(2, pendingTags.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      let tag = pendingTags.shift();
      while (tag !== undefined) {
        const artistSpecific = tagsSchema.parse(
          await qlooGet('/v2/tags', {
            'filter.query': tag,
            'filter.parents.types': 'urn:entity:artist',
            take: '2',
          }),
        );
        for (const result of artistSpecific.results.tags) unique.set(result.id, result);

        if (artistSpecific.results.tags.length === 0) {
          const general = tagsSchema.parse(
            await qlooGet('/v2/tags', {
              'filter.query': tag,
              take: '2',
            }),
          );
          for (const result of general.results.tags) unique.set(result.id, result);
        }
        tag = pendingTags.shift();
      }
    }),
  );

  return [...unique.values()];
}

async function getInsights(type: 'artist' | 'brand', tagIds: string[]): Promise<QlooEvidence[]> {
  const parsed = insightsSchema.parse(
    await qlooGet('/v2/insights', {
      'filter.type': `urn:entity:${type}`,
      'signal.interests.tags': tagIds.join(','),
      'feature.explainability': 'true',
      take: '10',
    }),
  );
  return parsed.results.entities.map((entity) => ({
    id: entity.entity_id,
    name: entity.name,
    domain: entity.subtype ?? `urn:entity:${type}`,
    affinity: typeof entity.query?.affinity === 'number' ? Math.round(entity.query.affinity * 100) : null,
    description: entity.properties?.description ?? null,
    explainability: entity.query?.explainability ?? undefined,
  }));
}

export async function getArtistInsights(tagIds: string[]): Promise<QlooEvidence[]> {
  return getInsights('artist', tagIds);
}

export async function getBrandInsights(tagIds: string[]): Promise<QlooEvidence[]> {
  return getInsights('brand', tagIds);
}
