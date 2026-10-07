import { readStoredValue, type StorageLike, writeStoredValue } from "./storage";

export type QaDisplayMode = "answer-first" | "citations-first";

export const normalizeQaDisplayMode = (
	value: string | null | undefined,
): QaDisplayMode =>
	value === "citations-first" ? "citations-first" : "answer-first";

export const toggleQaDisplayMode = (mode: QaDisplayMode): QaDisplayMode =>
	mode === "answer-first" ? "citations-first" : "answer-first";

export const getQaDisplayToggleLabel = (mode: QaDisplayMode): string =>
	mode === "citations-first" ? "Show answer first" : "Show citations first";

export const loadQaDisplayMode = (
	storage: StorageLike,
	key: string,
): QaDisplayMode => normalizeQaDisplayMode(readStoredValue(storage, key));

export const persistQaDisplayMode = (
	storage: StorageLike,
	key: string,
	mode: QaDisplayMode,
): QaDisplayMode => {
	writeStoredValue(storage, key, mode);
	return mode;
};
