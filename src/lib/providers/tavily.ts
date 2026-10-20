import { z } from 'zod';
import type { ResearchSource } from '@/types/shadowpersona';
import { fetchWithBackoff, requireEnv } from './http';

const extractSchema = z.object({
  results: z.array(z.object({ url: z.string(), title: z.string().nullish(), raw_content: z.string() })),
});

export async function extractUrl(url: string): Promise<{ source: ResearchSource; text: string } | null> {
  const response = await fetchWithBackoff('Tavily', 'https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireEnv('TAVILY_API_KEY')}` },
    body: JSON.stringify({ urls: [url] }),
  });
  const first = extractSchema.parse(await response.json()).results[0];
  if (!first) return null;
  return {
    source: { title: first.title || first.url, url: first.url },
    text: first.raw_content.slice(0, 8000),
  };
}
