import { describe, expect, it } from "bun:test";
import type { SearchEntry } from "../search";
import { filterEntriesToReadingWindow } from "./endpoint";

const entry = (slug: string): SearchEntry => ({
	id: `chapters-${slug}-intro`,
	type: "chapters",
	label: "Chapters",
	order: 1,
	title: slug,
	section: null,
	snippet: "snippet",
	url: `/read/chapters/${slug}`,
	context: slug,
});

describe("filterEntriesToReadingWindow", () => {
	const entries = [entry("intro"), entry("ch2"), entry("ch3")];

	it("returns all entries when no unlocked slugs are provided", () => {
		expect(filterEntriesToReadingWindow(entries)).toHaveLength(3);
		expect(filterEntriesToReadingWindow(entries, [])).toHaveLength(3);
	});

	it("restricts entries to the unlocked slugs", () => {
		const filtered = filterEntriesToReadingWindow(entries, ["intro", "ch2"]);
		expect(filtered.map((e) => e.context)).toEqual(["intro", "ch2"]);
	});

	it("falls back to all entries when nothing matches", () => {
		expect(filterEntriesToReadingWindow(entries, ["nonexistent"])).toHaveLength(
			3,
		);
	});
});
