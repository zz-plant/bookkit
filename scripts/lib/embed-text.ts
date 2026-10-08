/**
 * Local sentence embeddings for author-side checks (check:corpus).
 *
 * Uses @xenova/transformers, an optional dependency of the engine, running on
 * CPU. The first run of a model downloads it from Hugging Face into the
 * transformers cache, or into BOOKKIT_MODEL_CACHE when set. Nothing here runs
 * in CI or at build time.
 */

/**
 * A model check:corpus can run. Similarity scales differ by model, so each one
 * carries its own cutoff; compare models with `check:corpus --eval` before
 * changing a cutoff or the default.
 */
export type EmbeddingModel = {
	key: string;
	/** Hugging Face model id. */
	id: string;
	/** Task prefix some models expect in front of every input. */
	prefix: string;
	pooling: "mean" | "cls";
	/** false loads full-precision weights: slower and larger, but no quantization noise. */
	quantized: boolean;
	/** Semantic cutoff for flagging a pair, calibrated with `check:corpus --eval`. */
	threshold: number;
	/** Approximate first-run download. */
	download: string;
};

/**
 * Each cutoff is the highest that still flags every merge recorded in
 * corpus.json (three as of 2026-10-08), except minilm's 0.45, which predates
 * them and misses two (crumple-zone scores 0.36, refusability-gap 0.41).
 * nomic scores sit close together: on 2026-10-08, 0.79 flags 2 pairs (both
 * ruled distinct), 0.78 flags 8, 0.75 flags 37.
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
	minilm: {
		key: "minilm",
		id: "Xenova/all-MiniLM-L6-v2",
		prefix: "",
		pooling: "mean",
		quantized: true,
		threshold: 0.45,
		download: "25 MB",
	},
	nomic: {
		key: "nomic",
		id: "nomic-ai/nomic-embed-text-v1.5",
		prefix: "clustering: ",
		pooling: "mean",
		quantized: false,
		threshold: 0.79,
		download: "520 MB",
	},
	"bge-base": {
		key: "bge-base",
		id: "Xenova/bge-base-en-v1.5",
		prefix: "",
		pooling: "cls",
		quantized: false,
		threshold: 0.69,
		download: "420 MB",
	},
};

export const DEFAULT_EMBEDDING_MODEL_KEY = "nomic";

/** Resolves a --model value: a key from EMBEDDING_MODELS. */
export const resolveEmbeddingModel = (
	key: string = DEFAULT_EMBEDDING_MODEL_KEY,
): EmbeddingModel | null => EMBEDDING_MODELS[key] ?? null;

export type EmbedResult =
	| { ok: true; model: EmbeddingModel; vectors: Float32Array[] }
	| { ok: false; model: EmbeddingModel; reason: string };

type FeatureExtractor = (
	texts: string[],
	options: { pooling: "mean" | "cls"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array }>;

export const embedTexts = async (
	texts: string[],
	model: EmbeddingModel = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL_KEY],
): Promise<EmbedResult> => {
	let transformers: {
		pipeline: (
			task: string,
			model: string,
			options: { quantized: boolean },
		) => Promise<FeatureExtractor>;
		env: {
			cacheDir: string;
			allowLocalModels: boolean;
			backends: { onnx: { wasm: { numThreads: number } } };
		};
	};
	try {
		// The package's own types are looser than the subset used here.
		transformers = (await import(
			"@xenova/transformers"
		)) as unknown as typeof transformers;
	} catch (error) {
		return {
			ok: false,
			model,
			reason: `@xenova/transformers is not installed (${error instanceof Error ? error.message : String(error)}). Run bun install with optional dependencies, or pass --no-semantic.`,
		};
	}

	try {
		if (process.env.BOOKKIT_MODEL_CACHE) {
			transformers.env.cacheDir = process.env.BOOKKIT_MODEL_CACHE;
		}
		transformers.env.allowLocalModels = false;
		// Single-threaded WASM: the multi-threaded backend spawns workers from blob
		// URLs, which Bun rejects (ERR_WORKER_PATH) and which can leave the process hung.
		transformers.env.backends.onnx.wasm.numThreads = 1;
		const extract = await transformers.pipeline(
			"feature-extraction",
			model.id,
			{
				quantized: model.quantized,
			},
		);
		// One text per call: batched calls pad to the longest text, which shifts
		// every vector in the batch, so a mechanism's score would depend on which
		// other mechanisms happened to be loaded alongside it.
		const vectors: Float32Array[] = [];
		for (const text of texts) {
			const output = await extract([`${model.prefix}${text}`], {
				pooling: model.pooling,
				normalize: true,
			});
			vectors.push(Float32Array.from(output.data));
		}
		return { ok: true, model, vectors };
	} catch (error) {
		return {
			ok: false,
			model,
			reason: `Could not load or run ${model.id} (${error instanceof Error ? error.message : String(error)}). The first run needs network access to huggingface.co (about ${model.download}); pass --no-semantic for a lexical-only pass.`,
		};
	}
};
