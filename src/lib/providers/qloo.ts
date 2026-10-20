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
        query: z.object({ affinity: z.number().nullish() }).passthrough().optional(),
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

  await Promise.all(
    cleanTags.map(async (tag) => {
      // 1. Try artist-specific tags first (genres, subgenres, music styles)
      try {
        const parsed = tagsSchema.parse(
          await qlooGet('/v2/tags', {
            'filter.query': tag,
            'filter.parents.types': 'urn:entity:artist',
            take: '2',
          }),
        );
        for (const t of parsed.results.tags) {
          unique.set(t.id, t);
        }
        if (parsed.results.tags.length > 0) return;
      } catch {
        // Fall back to general lookup
      }

      // 2. Fall back to general tags (mood, ambience, aesthetic, audience)
      try {
        const parsed = tagsSchema.parse(
          await qlooGet('/v2/tags', {
            'filter.query': tag,
            take: '2',
          }),
        );
        for (const t of parsed.results.tags) {
          unique.set(t.id, t);
        }
      } catch {
        // Ignore single tag lookup errors
      }
    }),
  );

  return [...unique.values()];
}

export async function getArtistInsights(tagIds: string[]): Promise<QlooEvidence[]> {
  const parsed = insightsSchema.parse(
    await qlooGet('/v2/insights', {
      'filter.type': 'urn:entity:artist',
      'signal.interests.tags': tagIds.join(','),
      take: '10',
    }),
  );
  return parsed.results.entities.map((entity) => ({
    id: entity.entity_id,
    name: entity.name,
    domain: entity.subtype ?? 'urn:entity:artist',
    affinity: typeof entity.query?.affinity === 'number' ? Math.round(entity.query.affinity * 100) : null,
    description: entity.properties?.description ?? null,
  }));
}
