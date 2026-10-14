import { afterEach, describe, expect, it } from "bun:test";

import {
	deferredLocalStorage,
	readStoredJson,
	readStoredValue,
	writeStoredJson,
	writeStoredValue,
} from "./storage";

const setWindow = (localStorage: () => Storage) =>
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			get localStorage() {
				return localStorage();
			},
		},
	});

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("deferredLocalStorage", () => {
	it("falls back quietly when reading window.localStorage throws", () => {
		setWindow(() => {
			throw new DOMException("The operation is insecure.", "SecurityError");
		});

		expect(readStoredValue(deferredLocalStorage, "key")).toBeNull();
		expect(readStoredJson(deferredLocalStorage, "key")).toBeNull();
		expect(() =>
			writeStoredValue(deferredLocalStorage, "key", "v"),
		).not.toThrow();
		expect(() =>
			writeStoredJson(deferredLocalStorage, "key", [1]),
		).not.toThrow();
	});

	it("reads and writes window.localStorage when it is available", () => {
		const values = new Map<string, string>();
		setWindow(
			() =>
				({
					getItem: (key: string) => values.get(key) ?? null,
					setItem: (key: string, value: string) => values.set(key, value),
				}) as unknown as Storage,
		);

		writeStoredJson(deferredLocalStorage, "prefs", { density: "compact" });
		expect(readStoredJson(deferredLocalStorage, "prefs")).toEqual({
			density: "compact",
		});
	});
});
