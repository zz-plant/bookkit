import type { SearchEntry } from "../search";
import type { EmbeddingVector } from "./index";

export type EmbeddingEngineState = "idle" | "loading" | "ready" | "unavailable";

export type EmbeddingEngine = {
	state: EmbeddingEngineState;
	modelName: string;
	encode: (texts: string[]) => Promise<EmbeddingVector[]>;
	encodeEntries: (
		entries: SearchEntry[],
	) => Promise<Map<string, EmbeddingVector>>;
};

/** The model the reader's browser downloads to rank passages by meaning. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH_SIZE = 16;

const chunk = <T>(arr: T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
};

export const createEmbeddingEngine = async (
	onProgress?: (message: string) => void,
): Promise<EmbeddingEngine | null> => {
	if (typeof window === "undefined") return null;

	try {
		onProgress?.("Loading embedding model…");

		// Dynamic import so transformers.js remains optional at build time
		// biome-ignore lint/suspicious/noTsIgnore: the optional dependency may be absent, so the import may or may not type-check
		// @ts-ignore — optional dependency, loaded only when semantic search is enabled
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const transformers: any = await import("@xenova/transformers");
		const { pipeline } = transformers;
		const env = transformers.env;
		env.allowLocalModels = false;
		env.useBrowserCache = true;
		env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ?? 4;

		// @xenova/transformers v2 runs on WebAssembly only: it has no WebGPU
		// backend and ignores device/dtype options, so none are passed.
		const extractor: (...args: unknown[]) => Promise<unknown> = await pipeline(
			"feature-extraction",
			EMBEDDING_MODEL,
			{
				progress_callback: (p: {
					status: string;
					file?: string;
					loaded?: number;
					total?: number;
				}) => {
					if (
						p.status === "progress" &&
						p.total &&
						typeof p.loaded === "number"
					) {
						const pct = Math.round((p.loaded / p.total) * 100);
						onProgress?.(`Downloading model… ${pct}%`);
					}
				},
			},
		);
		onProgress?.("Model loaded.");

		const encode = async (texts: string[]): Promise<EmbeddingVector[]> => {
			const batches = chunk(texts, BATCH_SIZE);
			const results: EmbeddingVector[] = [];

			for (const batch of batches) {
				const output = (await extractor(batch, {
					pooling: "mean",
					normalize: true,
				})) as {
					data: number[];
					dims: number[];
				};
				const dim = output.dims[output.dims.length - 1];
				const total = output.data.length;

				for (let i = 0; i < total; i += dim) {
					results.push(Array.from(output.data.slice(i, i + dim)));
				}
			}

			return results;
		};

		const encodeEntries = async (
			entries: SearchEntry[],
		): Promise<Map<string, EmbeddingVector>> => {
			const texts = entries.map((e) => `${e.title}. ${e.snippet}`);
			const vectors = await encode(texts);
			const map = new Map<string, EmbeddingVector>();
			entries.forEach((entry, i) => {
				map.set(entry.id, vectors[i]);
			});
			return map;
		};

		return {
			state: "ready",
			modelName: EMBEDDING_MODEL,
			encode,
			encodeEntries,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		onProgress?.(`Embedding model unavailable: ${message}`);
		return null;
	}
};
