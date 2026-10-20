import { describe, expect, it } from "bun:test";
import { buildSearchEntries } from "./index";
import { createBookSearchSources } from "./sources";

const toolkit = `---
slug: classify-alert-severity
mechanism: incident-triage
name: "Classify severity"
owner: platform-oncall
trigger: "A pager alert fires and no one has stated what it means."
steps:
  - "Read the alert payload."
runbookSteps:
  - when: "Uptime or money is at risk"
    action: "Classify as sev-1 and name an owner."
escalation:
  to: "duty-manager"
  when: "A sev-1 is confirmed."
---

Classify, name an owner, and stop.
`;

const mechanism = `---
slug: incident-triage
title: "Incident Triage"
definition: "Alert chaos collapses when severity is classified under a time budget."
is:
  - "A severity classification made within the stated window."
---

## Scope

Keep triage about the first safe move.
`;

const triageChapter = `---
slug: triage-and-escalation
title: "Triage and escalation"
---

## Why triage first

An unclassified alert has no safe first action. Triage is a time budget, not a diagnosis, and this sentence runs on well past the one hundred and sixty characters a preview shows, so its last words are only in the text: rollback.
`;

const entries = () =>
	buildSearchEntries(
		createBookSearchSources({
			chapters: { "chapters/10-triage.mdx": triageChapter },
			mechanisms: { "mechanisms/incident-triage.mdx": mechanism },
			toolkit: { "toolkit/incident-triage--classify.mdx": toolkit },
			glossary: {},
			examples: {},
		}),
	);

const byId = async (id: string) =>
	(await entries()).find((entry) => entry.id === id);

describe("search entries", () => {
	it("opens a page's own result at the page, not at its first heading", async () => {
		expect((await byId("mechanisms-incident-triage-intro"))?.url).toBe(
			"/read/mechanisms/incident-triage",
		);
		expect((await byId("chapters-triage-and-escalation-intro"))?.url).toBe(
			"/read/chapters/triage-and-escalation",
		);
		expect((await byId("mechanisms-incident-triage-scope"))?.url).toBe(
			"/read/mechanisms/incident-triage#scope",
		);
	});

	it("previews the line a page leads with, never a Markdown heading", async () => {
		expect((await byId("toolkit-classify-alert-severity-intro"))?.snippet).toBe(
			"A pager alert fires and no one has stated what it means.",
		);
		expect((await byId("mechanisms-incident-triage-intro"))?.snippet).toBe(
			"Alert chaos collapses when severity is classified under a time budget.",
		);
		const chapterSnippet = (await byId("chapters-triage-and-escalation-intro"))
			?.snippet;
		expect(chapterSnippet).toStartWith("An unclassified alert");
		for (const entry of await entries()) {
			expect(entry.snippet, entry.id).not.toContain("#");
		}
	});

	it("matches the fields a page shows and its mechanism's title", async () => {
		const text = (await byId("toolkit-classify-alert-severity-intro"))?.text;
		for (const shown of [
			"Incident Triage",
			"platform-oncall",
			"A pager alert fires",
			"Read the alert payload.",
			"Uptime or money is at risk",
			"Classify as sev-1 and name an owner.",
			"duty-manager",
			"Classify, name an owner, and stop.",
		]) {
			expect(text).toContain(shown);
		}
		expect((await byId("mechanisms-incident-triage-intro"))?.text).toContain(
			"A severity classification made within the stated window.",
		);
	});

	it("keeps a section's whole text, beyond the preview", async () => {
		const section = await byId(
			"chapters-triage-and-escalation-why-triage-first",
		);
		expect(section?.snippet.length).toBeLessThanOrEqual(160);
		expect(section?.snippet).not.toContain("rollback");
		expect(section?.text).toEndWith("rollback.");
	});
});

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
		expect(intro.snippet).toBe("Set expectations for the rotation.");
		expect(section.snippet).toBe("Set expectations for the rotation.");
	});
});
