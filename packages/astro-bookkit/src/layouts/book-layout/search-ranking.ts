import type { SearchEntry } from "../../search";

export type RankedSearchResult = SearchEntry & {
	score: number;
	searchText: string;
};

export const buildRankedResults = (
	index: SearchEntry[],
	query: string,
	options?: {
		signals?: Record<string, number>;
		semanticScores?: Record<string, number>;
		semanticWeight?: number;
	},
) => {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return { tokens: [], results: [] as RankedSearchResult[] };
	}

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const semanticWeight = options?.semanticWeight ?? 0.4;

	const results = index
		.map((entry) => ({
			...entry,
			searchText:
				`${entry.title} ${entry.snippet} ${entry.context} ${entry.text ?? ""}`.toLowerCase(),
		}))
		.filter((entry) => {
			// Include entry if it matches any keyword OR has a semantic score
			const keywordMatch = tokens.every((token) =>
				entry.searchText.includes(token),
			);
			const semanticMatch = (options?.semanticScores?.[entry.id] ?? 0) > 0.3;
			return keywordMatch || semanticMatch;
		})
		.map((entry) => {
			const keywordScore = tokens.reduce((total, token) => {
				const titleBoost = entry.title.toLowerCase().includes(token) ? 4 : 0;
				const contextBoost = entry.context.toLowerCase().includes(token)
					? 2
					: 0;
				// A page's own result previews the line the page leads with (an
				// action's trigger, a mechanism's definition); a word there counts
				// as much as one in the page's title context.
				const leadBoost =
					!entry.section && entry.snippet.toLowerCase().includes(token) ? 2 : 0;
				return total + titleBoost + contextBoost + leadBoost + 1;
			}, 0);

			const signalBoost = options?.signals?.[entry.id] ?? 0;
			const semanticScore = options?.semanticScores?.[entry.id] ?? 0;

			// Blend keyword score and semantic score
			// Normalize keyword score (typical max ~6 per token * token count)
			const normalizedKeyword = keywordScore / (tokens.length * 7 + 1);
			const blendedScore =
				normalizedKeyword * (1 - semanticWeight) +
				semanticScore * semanticWeight +
				signalBoost * 0.5;

			return { ...entry, score: blendedScore };
		})
		.sort((a, b) => b.score - a.score);

	return { tokens, results };
};

/**
 * Where a result sits, for the line under its preview: its section (Toolkit,
 * Chapters, ...) and, for a heading inside a page, the page. A page's own
 * result names only its section, since its title is already the page's.
 * Results come in one list in score order, so this line is what tells a
 * reader which section each one is from.
 */
export const resultPlace = (entry: {
	label: string;
	title: string;
	context: string;
	section?: string | null;
}): { section: string; trail: string | null } => ({
	section: entry.label,
	trail: entry.section
		? `${entry.context} › ${entry.section}`
		: entry.context && entry.context !== entry.title
			? entry.context
			: null,
});
