import {
	loadTransformers,
	type ModelPipeline,
} from "../embeddings/transformers";
import type { SearchEntry } from "../search";

export type RerankResult = {
	entry: SearchEntry;
	score: number;
};

export type RerankEngine = {
	state: "idle" | "loading" | "ready" | "unavailable";
	rerank: (query: string, candidates: SearchEntry[]) => Promise<RerankResult[]>;
	isReady: () => boolean;
};

/** The model the reader's browser downloads to rerank the closest passages. */
export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
const BATCH_SIZE = 8;

const chunk = <T>(arr: T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
};

export const createRerankEngine = async (
	onProgress?: (message: string) => void,
): Promise<RerankEngine | null> => {
	if (typeof window === "undefined") return null;

	try {
		onProgress?.("Loading reranker model…");

		const { pipeline } = await loadTransformers();
		// @xenova/transformers v2 runs on WebAssembly only: it has no WebGPU
		// backend and ignores device/dtype options, so none are passed.
		const classifier: ModelPipeline = await pipeline(
			"text-classification",
			RERANK_MODEL,
		);
		onProgress?.("Reranker loaded.");

		return {
			state: "ready",
			async rerank(query, candidates) {
				const pairs = candidates.map((entry) => [
					query,
					`${entry.title}. ${entry.snippet}`,
				]);
				const batches = chunk(pairs, BATCH_SIZE);
				const scores: number[] = [];

				for (const batch of batches) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const outputs: any[] = (await classifier(
						batch as string[][],
					)) as any[];
					for (const output of outputs) {
						scores.push(output.score ?? 0);
					}
				}

				const result = candidates.map((entry, i) => ({
					entry,
					score: scores[i] ?? 0,
				}));

				result.sort((a, b) => b.score - a.score);
				return result;
			},
			isReady: () => true,
		};
	} catch (error) {
		onProgress?.(
			`Reranker unavailable: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
};
