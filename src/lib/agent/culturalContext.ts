import { z } from 'zod';
import { qlooEvidenceSchema } from '@/types/shadowpersona';
import { getArtistInsights, getBrandInsights, resolveTagIds } from '@/lib/providers/qloo';

export const culturalContextInputSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

export const culturalContextSchema = z.object({
  resolvedTags: z.array(z.object({ id: z.string(), name: z.string() })),
  artistEvidence: z.array(qlooEvidenceSchema),
  brandEvidence: z.array(qlooEvidenceSchema),
  brandEvidenceStatus: z.enum(['complete', 'empty', 'failed']),
});

export type CulturalContextInput = z.infer<typeof culturalContextInputSchema>;
export type CulturalContext = z.infer<typeof culturalContextSchema>;

export async function getCulturalContext(input: CulturalContextInput): Promise<CulturalContext> {
  const { tags } = culturalContextInputSchema.parse(input);
  const resolvedTags = await resolveTagIds(tags);
  if (resolvedTags.length === 0) {
    return culturalContextSchema.parse({
      resolvedTags: [],
      artistEvidence: [],
      brandEvidence: [],
      brandEvidenceStatus: 'empty',
    });
  }

  const tagIds = resolvedTags.map(({ id }) => id);
  const [artistResult, brandResult] = await Promise.allSettled([
    getArtistInsights(tagIds),
    getBrandInsights(tagIds),
  ]);

  if (artistResult.status === 'rejected') throw artistResult.reason;
  if (brandResult.status === 'rejected') {
    console.error(
      'Qloo brand insights were unavailable',
      brandResult.reason instanceof Error ? brandResult.reason.message : 'unknown error',
    );
  }

  const brandEvidence = brandResult.status === 'fulfilled' ? brandResult.value : [];
  return culturalContextSchema.parse({
    resolvedTags,
    artistEvidence: artistResult.value,
    brandEvidence,
    brandEvidenceStatus:
      brandResult.status === 'rejected'
        ? 'failed'
        : brandEvidence.length > 0
          ? 'complete'
          : 'empty',
  });
}
