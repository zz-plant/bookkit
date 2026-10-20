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

const chapter = `---
slug: triage-and-escalation
title: "Triage and escalation"
---

## Why triage first

An unclassified alert has no safe first action. Triage is a time budget, not a diagnosis, and this sentence runs on well past the one hundred and sixty characters a preview shows, so its last words are only in the text: rollback.
`;

const entries = () =>
	buildSearchEntries(
		createBookSearchSources({
			chapters: { "chapters/10-triage.mdx": chapter },
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
