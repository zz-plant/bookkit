import { EMBEDDING_MODEL } from "../../embeddings/engine";
import { RERANK_MODEL } from "../../rerank";
import { readStoredValue, type StorageLike, writeStoredValue } from "./storage";

/**
 * Whether this browser may download the models the Ask panel ranks passages
 * with. The panel asks on the reader's first question, before anything is
 * fetched, and keeps the answer per browser. "declined" keeps Ask on its
 * path without models: passages matched by their words, and the server's
 * answer when it has a key.
 */
export type QaModelChoice = "download" | "declined";

/**
 * What the reader is asked to download, as the prompt in `QaPanel.astro`
 * says it. The sizes are the Hub's: each model's quantized ONNX file (the
 * one @xenova/transformers loads by default) and its tokenizer, about 23.7
 * MB each. The runtime is ONNX Runtime's WebAssembly build
 * (`ort-wasm-simd.wasm`, 10 MB), which the book's own site serves
 * (`embeddings/onnx-wasm.ts`). Update them with the models.
 */
export const QA_MODEL_DOWNLOAD = {
	models: [EMBEDDING_MODEL, RERANK_MODEL],
	modelMegabytes: 48,
	modelHost: "huggingface.co",
	runtimeMegabytes: 10,
} as const;

/** The stored choice, or null when this browser has not been asked (or the value is not one). */
export const loadQaModelChoice = (
	storage: StorageLike,
	key: string,
): QaModelChoice | null => {
	const value = readStoredValue(storage, key);
	return value === "download" || value === "declined" ? value : null;
};

/** Keeps `choice` for this browser; when storage is blocked it lasts only as long as the page. */
export const persistQaModelChoice = (
	storage: StorageLike,
	key: string,
	choice: QaModelChoice,
): QaModelChoice => {
	writeStoredValue(storage, key, choice);
	return choice;
};
