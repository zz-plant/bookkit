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

	it("counts every heading the site slugs, and reads none in code", async () => {
		// The ids Astro 7.3.8 gave these headings on a built chapter page:
		// #### setup, # setup-1, ## setup-2, ### (in <details>) setup-3,
		// ## (under a list item) setup-4, <h2> none, setext setext-setup, ## setup-5.
		const entries = await buildSearchEntries([
			chapter(
				[
					"#### Setup",
					"Deep text.",
					"# Setup",
					"## Setup",
					"Check the pager first.",
					"```sh\n## not a heading\n```",
					"<details>\n<summary>More</summary>\n\n### Setup\n\nInside details.\n\n</details>",
					"- An item\n\n  ## Setup",
					"<h2>Setup</h2>",
					"Setext Setup\n------------",
					"## Setup",
					"Last words.",
				].join("\n\n"),
			),
		]);
		expect(
			entries
				.filter((entry) => entry.section)
				.map((entry) => [entry.url, entry.snippet]),
		).toEqual([
			["/read/chapters/a#setup-2", "Check the pager first. More"],
			["/read/chapters/a#setup-3", "Inside details. An item"],
			["/read/chapters/a#setup-4", "Setup"],
			["/read/chapters/a#setext-setup", "No summary available."],
			["/read/chapters/a#setup-5", "Last words."],
		]);
		expect(entries.map((entry) => entry.snippet).join(" ")).not.toContain(
			"not a heading",
		);
	});

	it("leaves author comments and heading marks out of snippets", async () => {
		const [intro, section] = await buildSearchEntries([
			chapter(
				"{/* reviewed after the March incident */}\n\n## Purpose\n\n{/* TODO: tighten */} Set expectations for the rotation.",
			),
		]);
		expect(intro.snippet).toBe("Purpose Set expectations for the rotation.");
		expect(section.snippet).toBe("Set expectations for the rotation.");
	});
});
