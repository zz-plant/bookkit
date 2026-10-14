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

		const result = await embedTexts(["text"], model, {
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

		const result = await embedTexts(["text"], model, {
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

		const declined = await embedTexts(["text"], model, {
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

		const accepted = await embedTexts(["text"], model, {
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

		const result = await embedTexts(["text"], model, {
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
