import type { SearchEntry } from "../../search";

export type RankedSearchResult = SearchEntry & { score: number; searchText: string };

export const buildRankedResults = (index: SearchEntry[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { tokens: [], results: [] as RankedSearchResult[] };
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = index
    .map((entry) => ({
      ...entry,
      searchText: `${entry.title} ${entry.snippet} ${entry.context}`.toLowerCase(),
    }))
    .filter((entry) => tokens.every((token) => entry.searchText.includes(token)))
    .map((entry) => {
      const score = tokens.reduce((total, token) => {
        const titleBoost = entry.title.toLowerCase().includes(token) ? 4 : 0;
        const contextBoost = entry.context.toLowerCase().includes(token) ? 2 : 0;
        return total + titleBoost + contextBoost + 1;
      }, 0);
      return { ...entry, score };
    })
    .sort((a, b) => b.score - a.score);

  return { tokens, results };
};
