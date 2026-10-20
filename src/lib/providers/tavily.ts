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

const searchSchema = z.object({
  results: z.array(z.object({ url: z.string(), title: z.string().nullish(), content: z.string() })),
});

// Keeps only sentences carrying numbers, so the model sees data points instead of marketing copy.
function compactQuantitative(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\d/.test(sentence) && sentence.length < 400)
    .slice(0, 6)
    .join(' ');
}

export async function searchHistoricalContext(
  query: string,
): Promise<{ sources: ResearchSource[]; compacted: string }> {
  const response = await fetchWithBackoff('Tavily', 'https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireEnv('TAVILY_API_KEY')}` },
    body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
  });
  const results = searchSchema.parse(await response.json()).results;
  const sources: ResearchSource[] = [];
  const blocks: string[] = [];
  for (const result of results) {
    const compacted = compactQuantitative(result.content);
    if (!compacted) continue;
    try {
      new URL(result.url);
    } catch {
      continue;
    }
    sources.push({ title: result.title || result.url, url: result.url });
    blocks.push(`[${result.title || result.url}] ${compacted}`);
  }
  return { sources, compacted: blocks.join('\n').slice(0, 6000) };
}
