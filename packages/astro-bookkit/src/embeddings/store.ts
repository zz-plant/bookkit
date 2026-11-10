import type { SearchEntry } from "../search";
import { createEmbeddingEngine } from "./engine";
import type { EmbeddingVector } from "./index";
import { cosineSimilarity, topKByScore } from "./index";

export type EmbeddingStore = {
	state: "idle" | "loading" | "ready" | "unavailable";
	load: (
		entries: SearchEntry[],
		onProgress?: (msg: string) => void,
	) => Promise<void>;
	rank: (
		query: string,
		k?: number,
	) => Promise<Array<{ entryId: string; score: number }>>;
	isReady: () => boolean;
};

export const createEmbeddingStore = (): EmbeddingStore => {
	let state: EmbeddingStore["state"] = "idle";
	let engine: Awaited<ReturnType<typeof createEmbeddingEngine>> = null;
	let entryEmbeddings = new Map<string, EmbeddingVector>();
	const queryCache = new Map<string, EmbeddingVector>();

	return {
		get state() {
			return state;
		},

		async load(entries, onProgress) {
			if (state === "loading" || state === "ready") return;
			state = "loading";

			engine = await createEmbeddingEngine(onProgress);
			if (!engine) {
				state = "unavailable";
				return;
			}

			try {
				onProgress?.("Computing passage embeddings…");
				entryEmbeddings = await engine.encodeEntries(entries);
				state = "ready";
				onProgress?.("Semantic search ready.");
			} catch {
				state = "unavailable";
			}
		},

		async rank(query, k = 20) {
			if (!engine || state !== "ready") return [];

			const cached = queryCache.get(query);
			const queryVector = cached ?? (await engine.encode([query]))[0];
			if (!cached) queryCache.set(query, queryVector);

			const scored = topKByScore(
				Array.from(entryEmbeddings.entries()),
				([, vector]) => cosineSimilarity(queryVector, vector),
				k,
			);

			return scored.map(({ item: [id] }) => ({
				entryId: id,
				score: scored.find((s) => s.item[0] === id)?.score ?? 0,
			}));
		},

		isReady() {
			return state === "ready";
		},
	};
};
