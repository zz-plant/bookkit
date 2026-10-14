import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	EMBEDDING_MODELS,
	embedTexts,
	type TransformersModule,
} from "./embed-text";

/**
 * The model download is mocked: a stand-in transformers module records
 * whether the pipeline (which downloads an uncached model) was started, and
 * fetch fails, so nothing here can reach the network.
 */

const model = EMBEDDING_MODELS.nomic;
let cacheDir: string;
const realFetch = globalThis.fetch;
const savedEnv = {
	cache: process.env.BOOKKIT_MODEL_CACHE,
	download: process.env.BOOKKIT_DOWNLOAD_MODEL,
};

const fakeTransformers = () => {
	const calls: string[] = [];
	const module: TransformersModule = {
		env: {
			cacheDir: "",
			allowLocalModels: true,
			backends: { onnx: { wasm: { numThreads: 4 } } },
		},
		pipeline: async (_task, id) => {
			calls.push(id);
			return async () => ({ dims: [1, 2], data: Float32Array.from([1, 0]) });
		},
	};
	return { calls, load: async () => module };
};

beforeAll(() => {
	cacheDir = mkdtempSync(join(tmpdir(), "bookkit-model-cache-"));
	globalThis.fetch = (async () => {
		throw new Error("network disabled in tests");
	}) as unknown as typeof fetch;
});

afterEach(() => {
	delete process.env.BOOKKIT_DOWNLOAD_MODEL;
});

afterAll(() => {
	globalThis.fetch = realFetch;
	rmSync(cacheDir, { recursive: true, force: true });
	for (const [key, value] of [
		["BOOKKIT_MODEL_CACHE", savedEnv.cache],
		["BOOKKIT_DOWNLOAD_MODEL", savedEnv.download],
	] as const) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("embedTexts model download", () => {
	it("does not download without a terminal, and says what it would fetch and how to allow it", async () => {
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		delete process.env.BOOKKIT_DOWNLOAD_MODEL;
		const transformers = fakeTransformers();
		const log: string[] = [];

		const result = await embedTexts(["no terminal"], model, {
			loadTransformers: transformers.load,
			interactive: false,
			log: (line) => log.push(line),
		});

		expect(transformers.calls).toEqual([]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain(
				`${model.id}, which is not downloaded yet: about 550 MB from huggingface.co, saved in ${cacheDir}.`,
			);
			expect(result.reason).toContain("BOOKKIT_DOWNLOAD_MODEL=1");
			expect(result.reason).toContain("--download-model");
			expect(result.reason).toContain("--quick");
		}
	});

	it("downloads when BOOKKIT_DOWNLOAD_MODEL=1 opts in, saying where", async () => {
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		process.env.BOOKKIT_DOWNLOAD_MODEL = "1";
		const transformers = fakeTransformers();
		const log: string[] = [];

		const result = await embedTexts(["opted in"], model, {
			loadTransformers: transformers.load,
			interactive: false,
			log: (line) => log.push(line),
		});

		expect(result.ok).toBe(true);
		expect(transformers.calls).toEqual([model.id]);
		expect(log).toEqual([
			`Downloading ${model.id} (about 550 MB) into ${cacheDir}. Later runs reuse it.`,
		]);
	});

	it("asks at a terminal, and respects a no", async () => {
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		const questions: string[] = [];
		const transformers = fakeTransformers();

		const declined = await embedTexts(["asked"], model, {
			loadTransformers: transformers.load,
			interactive: true,
			confirm: (question) => {
				questions.push(question);
				return false;
			},
			log: () => {},
		});
		expect(declined.ok).toBe(false);
		expect(transformers.calls).toEqual([]);
		expect(questions).toEqual(["Download it now? [y/N]"]);

		const accepted = await embedTexts(["asked"], model, {
			loadTransformers: transformers.load,
			interactive: true,
			confirm: () => true,
			log: () => {},
		});
		expect(accepted.ok).toBe(true);
		expect(transformers.calls).toEqual([model.id]);
	});

	it("uses a cached model without asking", async () => {
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		const weights = join(cacheDir, model.id, "onnx");
		mkdirSync(weights, { recursive: true });
		writeFileSync(join(weights, "model.onnx"), "");
		const transformers = fakeTransformers();
		const log: string[] = [];

		const result = await embedTexts(["cached model"], model, {
			loadTransformers: transformers.load,
			interactive: false,
			log: (line) => log.push(line),
		});

		expect(result.ok).toBe(true);
		expect(transformers.calls).toEqual([model.id]);
		expect(log).toEqual([]);
		rmSync(join(cacheDir, model.id), { recursive: true, force: true });
	});
});

describe("embedTexts stored vectors", () => {
	// A stand-in model whose vector encodes the text, so a reused vector can
	// be told apart from a fresh one.
	const textModel = () => {
		const embedded: string[] = [];
		const module: TransformersModule = {
			env: {
				cacheDir: "",
				version: "test",
				allowLocalModels: true,
				backends: { onnx: { wasm: { numThreads: 4 } } },
			},
			pipeline: async () => async (texts) => {
				embedded.push(...texts);
				return {
					dims: [1, 2],
					data: Float32Array.from([texts[0].length, 1]),
				};
			},
		};
		return { embedded, load: async () => module };
	};

	it("embeds a text once; a later run loads no model for it", async () => {
		const store = mkdtempSync(join(tmpdir(), "bookkit-vectors-"));
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		process.env.BOOKKIT_DOWNLOAD_MODEL = "1";
		const first = textModel();
		const one = await embedTexts(["alpha", "be"], model, {
			loadTransformers: first.load,
			log: () => {},
			vectorCache: store,
		});
		expect(first.embedded).toEqual([
			`${model.prefix}alpha`,
			`${model.prefix}be`,
		]);

		// No download allowed, and no model: every vector comes from the store.
		delete process.env.BOOKKIT_DOWNLOAD_MODEL;
		const second = textModel();
		const two = await embedTexts(["be", "alpha"], model, {
			loadTransformers: second.load,
			interactive: false,
			log: () => {},
			vectorCache: store,
		});
		expect(second.embedded).toEqual([]);
		expect(two.ok && one.ok).toBe(true);
		if (two.ok && one.ok) {
			expect([...two.vectors[0]]).toEqual([...one.vectors[1]]);
			expect([...two.vectors[1]]).toEqual([...one.vectors[0]]);
		}
		rmSync(store, { recursive: true, force: true });
	});

	it("embeds only the texts it has not seen, in their places", async () => {
		const store = mkdtempSync(join(tmpdir(), "bookkit-vectors-"));
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		process.env.BOOKKIT_DOWNLOAD_MODEL = "1";
		await embedTexts(["old"], model, {
			loadTransformers: textModel().load,
			log: () => {},
			vectorCache: store,
		});
		const run = textModel();
		const result = await embedTexts(["new text", "old"], model, {
			loadTransformers: run.load,
			log: () => {},
			vectorCache: store,
		});
		expect(run.embedded).toEqual([`${model.prefix}new text`]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.vectors.map((vector) => vector[0])).toEqual([
				`${model.prefix}new text`.length,
				`${model.prefix}old`.length,
			]);
		}
		rmSync(store, { recursive: true, force: true });
	});

	it("keeps no vectors with vectorCache: null", async () => {
		process.env.BOOKKIT_MODEL_CACHE = cacheDir;
		process.env.BOOKKIT_DOWNLOAD_MODEL = "1";
		for (let run = 0; run < 2; run++) {
			const once = textModel();
			await embedTexts(["unstored"], model, {
				loadTransformers: once.load,
				log: () => {},
				vectorCache: null,
			});
			expect(once.embedded).toEqual([`${model.prefix}unstored`]);
		}
	});
});
