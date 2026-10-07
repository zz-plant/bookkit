import { describe, expect, it } from "bun:test";

import {
	getQaDisplayToggleLabel,
	loadQaDisplayMode,
	persistQaDisplayMode,
	toggleQaDisplayMode,
} from "./qa-display-mode";

const createStorage = (seed: Record<string, string> = {}) => {
	const values = new Map(Object.entries(seed));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
};

describe("QA display mode persistence", () => {
	it("defaults invalid stored values to answer-first", () => {
		const storage = createStorage({ mode: "invalid" });

		expect(loadQaDisplayMode(storage, "mode")).toBe("answer-first");
	});

	it("persists toggled display modes and exposes the matching label", () => {
		const storage = createStorage();
		const nextMode = toggleQaDisplayMode("answer-first");

		persistQaDisplayMode(storage, "mode", nextMode);

		expect(loadQaDisplayMode(storage, "mode")).toBe("citations-first");
		expect(getQaDisplayToggleLabel(nextMode)).toBe("Show answer first");
	});
});
