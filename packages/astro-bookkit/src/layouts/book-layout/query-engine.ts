import { buildRankedResults, type RankedSearchResult } from "./search-ranking";
import type { SearchIndexStore } from "./search-index-store";

export type QueryRunResult =
  | { status: "stale" }
  | {
      status: "ready";
      normalizedQuery: string;
      tokens: string[];
      results: RankedSearchResult[];
    };

type QueryEngineOptions = {
  indexStore: SearchIndexStore;
  onStatus?: (message: string) => void;
};

export const normalizeQuery = (value: string): string => value.trim().toLowerCase();

export const createQueryEngine = ({ indexStore, onStatus }: QueryEngineOptions) => {
  let runToken = 0;

  const loadIndex = async () => indexStore.load({ onStatus });

  const run = async (value: string): Promise<QueryRunResult> => {
    const token = ++runToken;
    const index = await loadIndex();
    if (token !== runToken) {
      return { status: "stale" };
    }

    const normalizedQuery = normalizeQuery(value);
    if (!normalizedQuery) {
      return {
        status: "ready",
        normalizedQuery,
        tokens: [],
        results: [],
      };
    }

    const rankedResults = buildRankedResults(index, normalizedQuery);
    if (token !== runToken) {
      return { status: "stale" };
    }

    return {
      status: "ready",
      normalizedQuery,
      tokens: rankedResults.tokens,
      results: rankedResults.results,
    };
  };

  return { loadIndex, run };
};
