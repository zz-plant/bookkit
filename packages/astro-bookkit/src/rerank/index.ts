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

		// biome-ignore lint/suspicious/noTsIgnore: the optional dependency may be absent, so the import may or may not type-check
		// @ts-ignore — optional dependency, loaded only when WebGPU is enabled
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const transformers: any = await import("@xenova/transformers");
		const { pipeline, env } = transformers;
		env.allowLocalModels = false;
		env.useBrowserCache = true;

		let classifier: (...args: unknown[]) => Promise<unknown>;
		try {
			classifier = await pipeline("text-classification", RERANK_MODEL, {
				device: "webgpu",
				dtype: "fp16",
			});
			onProgress?.("Reranker loaded (WebGPU).");
		} catch {
			classifier = await pipeline("text-classification", RERANK_MODEL, {
				device: "cpu",
			});
			onProgress?.("Reranker loaded (CPU).");
		}

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
