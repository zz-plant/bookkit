import type { SearchIndexStore } from "./search-index-store";
import { buildRankedResults, type RankedSearchResult } from "./search-ranking";

export type QueryRunResult =
	| { status: "stale" }
	| {
			status: "ready";
			normalizedQuery: string;
			tokens: string[];
			results: RankedSearchResult[];
			/** No page had every word, so these have any of them. */
			partial: boolean;
	  };

type QueryEngineOptions = {
	indexStore: SearchIndexStore;
	onStatus?: (message: string) => void;
};

export const normalizeQuery = (value: string): string =>
	value.trim().toLowerCase();

export const createQueryEngine = ({
	indexStore,
	onStatus,
}: QueryEngineOptions) => {
	let runToken = 0;

	const loadIndex = async () => indexStore.load({ onStatus });

	const run = async (
		value: string,
		options?: {
			signals?: Record<string, number>;
			semanticScores?: Record<string, number>;
			leadType?: string;
		},
	): Promise<QueryRunResult> => {
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
				partial: false,
			};
		}

		const rankedResults = buildRankedResults(index, normalizedQuery, {
			signals: options?.signals,
			semanticScores: options?.semanticScores,
			leadType: options?.leadType,
		});

		if (token !== runToken) {
			return { status: "stale" };
		}

		return {
			status: "ready",
			normalizedQuery,
			tokens: rankedResults.tokens,
			results: rankedResults.results,
			partial: rankedResults.partial,
		};
	};

	return { loadIndex, run };
};
