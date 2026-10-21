// The two WebAssembly builds of ONNX Runtime that a single-threaded runtime
// chooses between: with SIMD, and without it for browsers that lack it. Vite
// copies each into the site's _astro/ folder under a hashed name, and these
// are their addresses there. @xenova/transformers ships the same files as the
// onnxruntime-web it pins, and the engine depends on it directly, so they
// resolve under any package layout. This module is imported only by
// `transformers.ts`, after the reader agrees to the download, so a static
// build or a book without @xenova/transformers carries none of it.
import ortWasm from "@xenova/transformers/dist/ort-wasm.wasm?url";
import ortWasmSimd from "@xenova/transformers/dist/ort-wasm-simd.wasm?url";

/** ONNX Runtime's `env.wasm.wasmPaths`: each file's name, and where this site serves it. */
export const ONNX_WASM_PATHS = {
	"ort-wasm.wasm": ortWasm,
	"ort-wasm-simd.wasm": ortWasmSimd,
};
