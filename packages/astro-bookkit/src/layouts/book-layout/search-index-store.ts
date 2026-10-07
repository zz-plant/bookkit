import type { SearchEntry } from "../../search";

export type SearchIndexStore = {
	load: (options?: {
		onStatus?: (message: string) => void;
	}) => Promise<SearchEntry[]>;
};

export const createSearchIndexStore = (
	fetchIndex: () => Promise<SearchEntry[]>,
	messages = {
		loading: "Loading index…",
		ready: "Type a word or phrase to find relevant sections.",
		unavailable: "Search is unavailable right now.",
	},
): SearchIndexStore => {
	let searchIndex: SearchEntry[] | null = null;
	let pendingLoad: Promise<SearchEntry[]> | null = null;

	return {
		async load(options) {
			if (searchIndex) return searchIndex;
			if (pendingLoad) return pendingLoad;

			options?.onStatus?.(messages.loading);
			pendingLoad = fetchIndex()
				.then((entries) => {
					searchIndex = entries;
					options?.onStatus?.(messages.ready);
					return entries;
				})
				.catch(() => {
					searchIndex = [];
					options?.onStatus?.(messages.unavailable);
					return searchIndex;
				})
				.finally(() => {
					pendingLoad = null;
				});

			return pendingLoad;
		},
	};
};
