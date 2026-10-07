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

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
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

	const hasWebGPU =
		"gpu" in navigator &&
		!!(
			navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
		).gpu?.requestAdapter;
	if (!hasWebGPU) {
		onProgress?.("GPU acceleration unavailable.");
	}

	try {
		onProgress?.("Loading embedding model…");

		// Dynamic import so transformers.js remains optional at build time
		// biome-ignore lint/suspicious/noTsIgnore: the optional dependency may be absent, so the import may or may not type-check
		// @ts-ignore — optional dependency, loaded only when WebGPU is enabled
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const transformers: any = await import("@xenova/transformers");
		const { pipeline } = transformers;
		const env = transformers.env;
		env.allowLocalModels = false;
		env.useBrowserCache = true;
		env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ?? 4;

		// Prefer WebGPU with fp16, fallback to wasm
		let extractor: (...args: unknown[]) => Promise<unknown>;
		try {
			extractor = await pipeline("feature-extraction", DEFAULT_MODEL, {
				device: "webgpu",
				dtype: "fp16",
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
			});
			onProgress?.("Model loaded (WebGPU).");
		} catch {
			extractor = await pipeline("feature-extraction", DEFAULT_MODEL, {
				device: "cpu",
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
			});
			onProgress?.("Model loaded (CPU).");
		}

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
			modelName: DEFAULT_MODEL,
			encode,
			encodeEntries,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		onProgress?.(`Embedding model unavailable: ${message}`);
		return null;
	}
};
