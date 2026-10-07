/**
 * Shared search index store — created once regardless of which feature island loads first.
 * Both search and QA controllers share the same index to avoid duplicate fetches.
 */

import type { SearchIndexStore } from "./search-index-store";
import { createSearchIndexStore } from "./search-index-store";

let instance: SearchIndexStore | null = null;

export const getSharedIndexStore = (): SearchIndexStore => {
	if (instance) return instance;

	instance = createSearchIndexStore(async () => {
		const response = await fetch("/search-index.json");
		const payload = await response.json();
		return payload.entries ?? [];
	});

	return instance;
};
