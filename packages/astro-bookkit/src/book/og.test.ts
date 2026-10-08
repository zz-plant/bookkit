import { describe, expect, it } from "bun:test";

import { getOgImageForPath, normalizeOgPathname } from "./og";

describe("og helpers", () => {
	it("normalizes locale prefixes and trailing slashes", () => {
		expect(normalizeOgPathname("/en/read/chapters/intro/")).toBe(
			"/read/chapters/intro",
		);
		expect(normalizeOgPathname("/en-us/read")).toBe("/read");
		expect(normalizeOgPathname("")).toBe("/");
	});

	it("gives every page its own generated image", () => {
		expect(getOgImageForPath("/")).toBe("/og/index.png");
		expect(getOgImageForPath("/read/chapters/")).toBe("/og/read/chapters.png");
		expect(getOgImageForPath("/fr/read/chapters/chapter-1")).toBe(
			"/og/read/chapters/chapter-1.png",
		);
	});
});
