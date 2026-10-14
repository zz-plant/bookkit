import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";
import { engineRequire } from "./engine-require";

describe("engineRequire", () => {
	it("resolves from the engine package, so its own dependencies are found", () => {
		const require = engineRequire();
		expect(require.resolve("@bookkit/astro-bookkit/package.json")).toBe(
			join(dirname(import.meta.dir), "..", "package.json"),
		);
		expect(
			require.resolve(
				"@fontsource/newsreader/files/newsreader-latin-600-normal.woff",
			),
		).toEndWith("newsreader-latin-600-normal.woff");
	});
});
