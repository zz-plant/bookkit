import { describe, expect, it } from "bun:test";

import { chapterSlugOfPath } from "./chapter-slug";

describe("chapterSlugOfPath", () => {
	it("names the chapter of a chapter page's path", () => {
		expect(chapterSlugOfPath("/read/chapters/rollback-first")).toBe(
			"rollback-first",
		);
		expect(chapterSlugOfPath("/read/chapters/rollback-first/")).toBe(
			"rollback-first",
		);
	});

	it("names none for any other page", () => {
		for (const path of [
			"/",
			"/read",
			"/read/chapters",
			"/read/chapters/",
			"/read/mechanisms/incident-triage",
			"/fr/read/chapters/rollback-first",
		]) {
			expect(chapterSlugOfPath(path), path).toBeNull();
		}
	});

	it("names none for an address no chapter has, which the endpoint would refuse", () => {
		for (const path of [
			"/read/chapters/Rollback-First",
			"/read/chapters/caf%C3%A9",
			"/read/chapters/rollback%20first",
			`/read/chapters/${"a".repeat(201)}`,
		]) {
			expect(chapterSlugOfPath(path), path).toBeNull();
		}
	});
});
