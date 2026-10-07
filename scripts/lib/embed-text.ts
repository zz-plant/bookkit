/**
 * Local sentence embeddings for author-side checks (check:corpus).
 *
 * Uses @xenova/transformers, an optional dependency of the engine, with a
 * small model that runs on CPU in a few seconds. The first run downloads the
 * model (~25 MB) from Hugging Face into the transformers cache, or into
 * BOOKKIT_MODEL_CACHE when set. Nothing here runs in CI or at build time.
 */

export const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

export type EmbedResult =
	| { ok: true; model: string; vectors: Float32Array[] }
	| { ok: false; model: string; reason: string };

type FeatureExtractor = (
	texts: string[],
	options: { pooling: "mean"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array }>;

export const embedTexts = async (
	texts: string[],
	model = DEFAULT_EMBEDDING_MODEL,
): Promise<EmbedResult> => {
	let transformers: {
		pipeline: (task: string, model: string) => Promise<FeatureExtractor>;
		env: { cacheDir: string; allowLocalModels: boolean };
	};
	try {
		transformers = await import("@xenova/transformers");
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
		const extract = await transformers.pipeline("feature-extraction", model);
		// One text per call: batched calls pad to the longest text, which shifts
		// every vector in the batch, so a mechanism's score would depend on which
		// other mechanisms happened to be loaded alongside it.
		const vectors: Float32Array[] = [];
		for (const text of texts) {
			const output = await extract([text], {
				pooling: "mean",
				normalize: true,
			});
			vectors.push(Float32Array.from(output.data));
		}
		return { ok: true, model, vectors };
	} catch (error) {
		return {
			ok: false,
			model,
			reason: `Could not load or run ${model} (${error instanceof Error ? error.message : String(error)}). The first run needs network access to huggingface.co; pass --no-semantic for a lexical-only pass.`,
		};
	}
};
