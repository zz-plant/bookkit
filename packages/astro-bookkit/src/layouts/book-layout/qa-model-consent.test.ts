import { describe, expect, it } from "bun:test";

import { EMBEDDING_MODEL } from "../../embeddings/engine";
import { RERANK_MODEL } from "../../rerank";
import {
	loadQaModelChoice,
	persistQaModelChoice,
	QA_MODEL_DOWNLOAD,
} from "./qa-model-consent";

const createStorage = (seed: Record<string, string> = {}) => {
	const values = new Map(Object.entries(seed));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
};

const blockedStorage = {
	getItem: (): string | null => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
	setItem: () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
};

describe("the Ask panel's model download choice", () => {
	it("is unasked until the reader chooses, and remembered after", () => {
		const storage = createStorage();
		expect(loadQaModelChoice(storage, "models")).toBeNull();

		persistQaModelChoice(storage, "models", "declined");
		expect(loadQaModelChoice(storage, "models")).toBe("declined");
		persistQaModelChoice(storage, "models", "download");
		expect(loadQaModelChoice(storage, "models")).toBe("download");
	});

	it("counts any other stored value as unasked", () => {
		for (const value of ["true", "yes", "", "DOWNLOAD"]) {
			expect(
				loadQaModelChoice(createStorage({ models: value }), "models"),
			).toBeNull();
		}
	});

	it("reads as unasked, and saves without throwing, when the browser blocks storage", () => {
		expect(loadQaModelChoice(blockedStorage, "models")).toBeNull();
		expect(persistQaModelChoice(blockedStorage, "models", "declined")).toBe(
			"declined",
		);
	});

	it("names the models the panel's engines load", () => {
		expect(QA_MODEL_DOWNLOAD.models).toEqual([EMBEDDING_MODEL, RERANK_MODEL]);
	});
});
