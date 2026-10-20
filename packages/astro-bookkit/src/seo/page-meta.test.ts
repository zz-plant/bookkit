import { describe, expect, it } from "bun:test";
import { extractPageFacts } from "../markdown/pageFacts";
import {
	bookPageTitle,
	firstMetaDescription,
	isThinPage,
	shortBookTitle,
	toMetaDescription,
} from "./page-meta";

describe("shortBookTitle", () => {
	it("keeps the text before the first colon", () => {
		expect(
			shortBookTitle(
				"The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
			),
		).toBe("The Crumple Zone");
		expect(shortBookTitle("Bad People")).toBe("Bad People");
	});
});

describe("bookPageTitle", () => {
	it("puts the page first and the short title after it", () => {
		expect(
			bookPageTitle(
				"Recertification loop as silent denial",
				"Don’t Turn People Into Infrastructure: Why Institutions Run Hot — and Who They Burn",
			),
		).toBe(
			"Recertification loop as silent denial • Don’t Turn People Into Infrastructure",
		);
	});

	it("does not repeat the book when the page is the book", () => {
		expect(bookPageTitle("Bad People", "Bad People")).toBe("Bad People");
		expect(bookPageTitle(undefined, "Bad People")).toBe("Bad People");
	});
});

describe("toMetaDescription", () => {
	it("strips markdown and collapses whitespace", () => {
		expect(toMetaDescription("A **bold**\n  [claim](/x).")).toBe(
			"A bold claim.",
		);
	});

	it("keeps the words of inline code", () => {
		expect(toMetaDescription("Set `max_retries` before paging.")).toBe(
			"Set max_retries before paging.",
		);
	});

	it("keeps an opening paragraph's escaped placeholders, and tags inside code", () => {
		const { excerpt } = extractPageFacts(
			"Replace \\<service-name\\> with the service that pages you, and wrap the timeline in `<details>`.",
		);
		expect(toMetaDescription(excerpt)).toBe(
			"Replace <service-name> with the service that pages you, and wrap the timeline in <details>.",
		);
	});

	it("reads an opening paragraph's tags as the page shows their words", () => {
		const { excerpt } = extractPageFacts(
			"Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy the alert,<br/>then paste it into the incident log.",
		);
		expect(toMetaDescription(excerpt)).toBe(
			"Press Ctrl+C to copy the alert, then paste it into the incident log.",
		);
	});

	it("cuts long text at a word boundary with an ellipsis", () => {
		const long = `${"word ".repeat(60)}end`;
		const description = toMetaDescription(long) ?? "";
		expect(description.length).toBeLessThanOrEqual(160);
		expect(description.endsWith("word…")).toBe(true);
	});

	it("returns undefined for empty input", () => {
		expect(toMetaDescription("  ")).toBeUndefined();
		expect(toMetaDescription(undefined)).toBeUndefined();
	});
});

describe("firstMetaDescription", () => {
	it("skips empty candidates", () => {
		expect(firstMetaDescription(undefined, "", "Second.")).toBe("Second.");
	});
});

describe("isThinPage", () => {
	it("flags pages under the minimum and never pages without a count", () => {
		expect(isThinPage(30)).toBe(true);
		expect(isThinPage(75)).toBe(false);
		expect(isThinPage(undefined)).toBe(false);
		expect(isThinPage(30, { minIndexableWords: 0 })).toBe(false);
		expect(isThinPage(75, { minIndexableWords: 100 })).toBe(true);
	});
});
