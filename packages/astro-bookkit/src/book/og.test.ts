import { describe, expect, it } from "bun:test";

import {
	DEFAULT_OG_SURFACE_IMAGE_MAP,
	getOgImageForPath,
	normalizeOgPathname,
} from "./og";

describe("og helpers", () => {
	it("normalizes locale prefixes and trailing slashes", () => {
		expect(normalizeOgPathname("/en/read/chapters/intro/")).toBe(
			"/read/chapters/intro",
		);
		expect(normalizeOgPathname("/en-us/read")).toBe("/read");
		expect(normalizeOgPathname("")).toBe("/");
	});

	it("maps normalized routes to expected og assets", () => {
		expect(getOgImageForPath("/")).toBe(DEFAULT_OG_SURFACE_IMAGE_MAP.home);
		expect(getOgImageForPath("/read/chapters")).toBe(
			DEFAULT_OG_SURFACE_IMAGE_MAP.chapters,
		);
		expect(getOgImageForPath("/fr/read/chapters/chapter-1")).toBe(
			DEFAULT_OG_SURFACE_IMAGE_MAP.chapterDetail,
		);
		expect(getOgImageForPath("/unknown")).toBe(
			DEFAULT_OG_SURFACE_IMAGE_MAP.fallback,
		);
	});
});
