/** A model `pipeline` loaded: called with its inputs, it resolves to its output. */
export type ModelPipeline = (...args: unknown[]) => Promise<unknown>;

/** What the engines use of @xenova/transformers, typed whether or not it is installed. */
type Transformers = {
	pipeline: (
		task: string,
		model: string,
		options?: Record<string, unknown>,
	) => Promise<ModelPipeline>;
	env: {
		allowLocalModels: boolean;
		useBrowserCache: boolean;
		backends: {
			onnx: { wasm: { wasmPaths: Record<string, string>; numThreads: number } };
		};
	};
};

/**
 * @xenova/transformers, set up to run the Ask panel's models in the reader's
 * browser: the models come from the Hugging Face Hub and the browser keeps
 * them; ONNX Runtime's WebAssembly comes from this site (`onnx-wasm.ts`),
 * where transformers.js would otherwise fetch it from jsDelivr.
 *
 * Both are loaded on the first call, which the panel makes only after the
 * reader agrees to the download (`layouts/book-layout/qa-model-consent.ts`).
 * The call rejects when the optional dependency is not installed.
 */
export const loadTransformers = async (): Promise<Transformers> => {
	const [transformers, { ONNX_WASM_PATHS }] = await Promise.all([
		// biome-ignore lint/suspicious/noTsIgnore: the optional dependency may be absent, so the import may or may not type-check
		// @ts-ignore — optional dependency, typed by what the engines use of it
		import("@xenova/transformers") as Promise<Transformers>,
		import("./onnx-wasm"),
	]);
	const { env } = transformers;
	env.allowLocalModels = false;
	env.useBrowserCache = true;
	env.backends.onnx.wasm.wasmPaths = ONNX_WASM_PATHS;
	// More threads need SharedArrayBuffer, which a browser gives only a
	// cross-origin-isolated page, and a book's pages are not one; the site
	// ships only the single-threaded runtime.
	env.backends.onnx.wasm.numThreads = 1;
	return transformers;
};
