import type { SearchEntry } from "../search";
import type { EmbeddingVector } from "./index";
import { createEmbeddingEngine } from "./engine";
import { cosineSimilarity, topKByScore } from "./index";

export type EmbeddingStore = {
  state: "idle" | "loading" | "ready" | "unavailable";
  load: (entries: SearchEntry[], onProgress?: (msg: string) => void) => Promise<void>;
  rank: (query: string, k?: number) => Promise<Array<{ entryId: string; score: number }>>;
  isReady: () => boolean;
};

export const createEmbeddingStore = (): EmbeddingStore => {
  let state: EmbeddingStore["state"] = "idle";
  let engine: Awaited<ReturnType<typeof createEmbeddingEngine>> = null;
  let entryEmbeddings = new Map<string, EmbeddingVector>();
  let entriesById = new Map<string, SearchEntry>();
  let queryCache = new Map<string, EmbeddingVector>();

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

      entriesById = new Map(entries.map((e) => [e.id, e]));

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

      let queryVector = queryCache.get(query);
      if (!queryVector) {
        const vectors = await engine.encode([query]);
        queryVector = vectors[0];
        queryCache.set(query, queryVector);
      }

      const scored = topKByScore(
        Array.from(entryEmbeddings.entries()),
        ([, vector]) => cosineSimilarity(queryVector!, vector),
        k
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
