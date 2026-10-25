import { z } from 'zod';
import {
  httpUrlSchema,
  type CompetitiveBenchmark,
  type EventPlan,
  type PromoterLocation,
  type ResearchSource,
} from '@/types/shadowpersona';
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

async function searchOnce(query: string): Promise<HistoricalSearch> {
  const response = await fetchWithBackoff('Tavily', 'https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireEnv('TAVILY_API_KEY')}` },
    body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
  });
  const results = searchSchema.parse(await response.json()).results;
  const sources: ResearchSource[] = [];
  const benchmarks: CompetitiveBenchmark[] = [];
  const blocks: string[] = [];
  for (const result of results) {
    const compacted = compactQuantitative(result.content);
    if (!compacted) continue;
    if (!httpUrlSchema.safeParse(result.url).success) continue;
    const title = result.title || result.url;
    sources.push({ title, url: result.url });
    benchmarks.push({ title, url: result.url, snippet: compacted.slice(0, 320) });
    blocks.push(`[${title}] ${compacted}`);
  }
  return { sources, benchmarks, compacted: blocks.join('\n').slice(0, 6000) };
}

interface HistoricalSearch {
  sources: ResearchSource[];
  benchmarks: CompetitiveBenchmark[];
  compacted: string;
}

// Widens the query step by step until a search yields quantitative text.
export async function searchHistoricalContext(
  tags: string[],
  location?: PromoterLocation,
  eventPlan?: EventPlan,
): Promise<HistoricalSearch & { query: string | null }> {
  const eventType =
    eventPlan?.eventType === 'music-festival'
      ? 'music festival'
      : eventPlan?.eventType === 'comedy-show'
        ? 'comedy show'
        : 'concert tour';
  const talent = eventPlan?.featuredTalent.trim();
  const organizer = eventPlan?.organizerName.trim();
  const locale = location ? ` in ${location}` : '';
  const subject = [talent, organizer, tags.slice(0, 2).join(' ')].filter(Boolean).join(' ');
  const hasOrganizerBrief = Boolean(talent || organizer || eventPlan?.demoLabel || eventPlan?.location || eventPlan?.eventDate);
  const queries = [
    ...(hasOrganizerBrief
      ? [`${talent || subject || eventType}${locale} public aggregate social audience reach and event engagement`]
      : []),
    `${subject || eventType} ${eventType}${locale} reported ticket prices attendance venue capacity`,
    `${eventType}${locale} ticket sales attendance revenue sponsorship benchmarks`,
    ...(!hasOrganizerBrief ? [`${talent || tags[0] || eventType}${locale} public aggregate social audience reach event engagement`] : []),
  ].filter((query, index, all) => all.indexOf(query) === index);

  for (const query of queries) {
    const found = await searchOnce(query);
    if (found.compacted) return { ...found, query };
  }
  return { sources: [], benchmarks: [], compacted: '', query: null };
}
