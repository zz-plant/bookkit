import { describe, expect, it } from "bun:test";
import { buildSearchEntries } from "./index";

const chapter = (body: string) => ({
	type: "chapters",
	label: "Chapters",
	order: 1,
	urlPrefix: "/read/chapters/",
	titleKey: "title",
	modules: {
		"/src/content/book/chapters/a.mdx": `---\ntitle: A\n---\n${body}`,
	},
});

describe("buildSearchEntries", () => {
	it("keeps the words of inline code in snippets and section titles", async () => {
		const entries = await buildSearchEntries([
			chapter(
				"## Tuning `max_retries`\n\nSet `max_retries` to 3 and \\<owner\\> pages first.",
			),
		]);
		const section = entries.find((entry) => entry.section);
		expect(section?.title).toBe("Tuning max_retries");
		expect(section?.snippet).toBe(
			"Set max_retries to 3 and <owner> pages first.",
		);
	});

	it("links each section to the id the site gives its heading", async () => {
		const entries = await buildSearchEntries([
			chapter(
				[
					"## Tuning `max_retries`",
					"## Tuning `max_retries`",
					'## Don\'t -- stop: the "quick" fix...',
					"## Code `a--b` keeps -- its dashes",
				].join("\n\nText.\n\n"),
			),
		]);
		expect(
			entries.filter((entry) => entry.section).map((entry) => entry.url),
		).toEqual([
			"/read/chapters/a#tuning-max_retries",
			"/read/chapters/a#tuning-max_retries-1",
			"/read/chapters/a#dont--stop-the-quick-fix",
			"/read/chapters/a#code-a--b-keeps--its-dashes",
		]);
	});
});
