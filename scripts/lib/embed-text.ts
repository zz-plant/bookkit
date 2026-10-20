import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ask, isInteractive } from "./cli";

/**
 * Local sentence embeddings for author-side checks (check:corpus).
 *
 * Uses @xenova/transformers, an optional dependency of the engine, running on
 * CPU. A model that is not cached yet is downloaded from Hugging Face into
 * the transformers cache (inside node_modules), or into BOOKKIT_MODEL_CACHE
 * when set, and only with consent: a yes at a terminal prompt,
 * BOOKKIT_DOWNLOAD_MODEL=1, or `allowDownload`. Without a terminal and without
 * either opt-in nothing is downloaded and the caller falls back to wording.
 * Nothing here runs in CI or at build time.
 *
 * Vectors are stored beside the model, one file per model and text, and a
 * text embedded before is not embedded again. When no mechanism changed, a
 * run loads no model at all.
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
		download: "550 MB",
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

/** The subset of @xenova/transformers used here. */
export type TransformersModule = {
	pipeline: (
		task: string,
		model: string,
		options: { quantized: boolean },
	) => Promise<FeatureExtractor>;
	env: {
		cacheDir: string;
		/** The library's version; vectors from another version are not reused. */
		version?: string;
		allowLocalModels: boolean;
		backends: { onnx: { wasm: { numThreads: number } } };
	};
};

export type EmbedOptions = {
	/**
	 * Download the model if it is not cached. Default: yes when
	 * BOOKKIT_DOWNLOAD_MODEL is 1 or true, else ask at a terminal, else no.
	 */
	allowDownload?: boolean;
	/** Replaces the @xenova/transformers import (tests). */
	loadTransformers?: () => Promise<TransformersModule>;
	/** Whether a person can answer a prompt. Default: stdin and stdout are terminals. */
	interactive?: boolean;
	/** Asks a yes/no question. Default: a prompt on the terminal. */
	confirm?: (question: string) => boolean;
	/** Where notices go. Default: stderr, so --json output stays parseable. */
	log?: (line: string) => void;
	/**
	 * Folder for stored vectors; null stores none. Default: `bookkit-vectors`
	 * in the model cache.
	 */
	vectorCache?: string | null;
	/**
	 * Use stored vectors only: never load or download the model, and fail when
	 * any text has none. For quick checks that can fall back to wording.
	 */
	storedOnly?: boolean;
};

/** Where the model's weights land once downloaded. */
const modelWeightsPath = (cacheDir: string, model: EmbeddingModel): string =>
	join(
		cacheDir,
		model.id,
		"onnx",
		model.quantized ? "model_quantized.onnx" : "model.onnx",
	);

/**
 * A text's stored vector. Each text is embedded on its own (see below), so its
 * vector depends only on the model, the library, and the text.
 */
const vectorPath = (
	dir: string,
	model: EmbeddingModel,
	version: string,
	text: string,
): string =>
	join(
		dir,
		model.key,
		`${createHash("sha256")
			.update(
				JSON.stringify([
					model.id,
					model.prefix,
					model.pooling,
					model.quantized,
					version,
					text,
				]),
			)
			.digest("hex")}.f32`,
	);

const readVector = (path: string): Float32Array | null => {
	if (!existsSync(path)) return null;
	const bytes = readFileSync(path);
	if (bytes.byteLength === 0 || bytes.byteLength % 4 !== 0) return null;
	return new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);
};

const downloadAllowedByEnv = (): boolean =>
	/^(1|true|yes)$/i.test(process.env.BOOKKIT_DOWNLOAD_MODEL ?? "");

export const embedTexts = async (
	texts: string[],
	model: EmbeddingModel = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL_KEY],
	options: EmbedOptions = {},
): Promise<EmbedResult> => {
	const log = options.log ?? ((line: string) => console.error(line));
	let transformers: TransformersModule;
	try {
		// The package's own types are looser than the subset used here.
		transformers = options.loadTransformers
			? await options.loadTransformers()
			: ((await import(
					"@xenova/transformers"
				)) as unknown as TransformersModule);
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

		const cacheDir = transformers.env.cacheDir;
		const store =
			options.vectorCache === undefined
				? cacheDir
					? join(cacheDir, "bookkit-vectors")
					: null
				: options.vectorCache;
		const paths = texts.map((text) =>
			store
				? vectorPath(store, model, transformers.env.version ?? "", text)
				: null,
		);
		const vectors = paths.map((path) => (path ? readVector(path) : null));
		const missing = texts
			.map((_, index) => index)
			.filter((index) => vectors[index] === null);
		if (missing.length === 0) {
			return { ok: true, model, vectors: vectors as Float32Array[] };
		}
		if (options.storedOnly) {
			return {
				ok: false,
				model,
				reason: `${missing.length} of ${texts.length} text(s) have no stored vector; check:corpus stores them.`,
			};
		}

		if (!existsSync(modelWeightsPath(cacheDir, model))) {
			const where = process.env.BOOKKIT_MODEL_CACHE
				? cacheDir
				: `${cacheDir} (inside node_modules, so a reinstall deletes it; set BOOKKIT_MODEL_CACHE to keep it elsewhere)`;
			const what = `The meaning pass needs ${model.id}, which is not downloaded yet: about ${model.download} from huggingface.co, saved in ${where}.`;
			const interactive = options.interactive ?? isInteractive();
			let allowed = options.allowDownload ?? downloadAllowedByEnv();
			if (!allowed && interactive) {
				log(what);
				const confirm =
					options.confirm ??
					((question: string) => /^y(es)?$/i.test(ask(question) ?? ""));
				allowed = confirm("Download it now? [y/N]");
				if (!allowed) {
					return {
						ok: false,
						model,
						reason: `${model.id} was not downloaded, so only wording was compared. To download it without this question, pass --download-model or set BOOKKIT_DOWNLOAD_MODEL=1; to skip the meaning pass, pass --quick (bookkit check) or --no-semantic (check:corpus).`,
					};
				}
			} else if (!allowed) {
				return {
					ok: false,
					model,
					reason: `${what} Nothing is downloaded without a terminal to confirm it: pass --download-model or set BOOKKIT_DOWNLOAD_MODEL=1 to allow it, or pass --quick (bookkit check) or --no-semantic (check:corpus) to compare wording only.`,
				};
			}
			log(
				`Downloading ${model.id} (about ${model.download}) into ${cacheDir}. Later runs reuse it.`,
			);
		}

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
		for (const index of missing) {
			const output = await extract([`${model.prefix}${texts[index]}`], {
				pooling: model.pooling,
				normalize: true,
			});
			const vector = Float32Array.from(output.data);
			vectors[index] = vector;
			const path = paths[index];
			if (path) {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, new Uint8Array(vector.buffer));
			}
		}
		return { ok: true, model, vectors: vectors as Float32Array[] };
	} catch (error) {
		return {
			ok: false,
			model,
			reason: `Could not load or run ${model.id} (${error instanceof Error ? error.message : String(error)}). The first run needs network access to huggingface.co (about ${model.download}); pass --no-semantic for a lexical-only pass.`,
		};
	}
};
