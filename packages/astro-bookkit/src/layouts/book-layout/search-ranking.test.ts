import { describe, expect, it } from "bun:test";

import type { SearchEntry } from "../../search/index";
import { buildRankedResults, groupRankedResults } from "./search-ranking";

const entries: SearchEntry[] = [
	{
		id: "mechanisms-transfer-success-intro",
		type: "mechanisms",
		label: "Mechanisms",
		order: 2,
		title: "Transfer success",
		snippet: "Use this pattern to improve transfer between teams.",
		url: "/read/mechanisms/transfer-success",
		context: "Transfer success",
	},
	{
		id: "chapters-compliance-intro",
		type: "chapters",
		label: "Chapters",
		order: 1,
		title: "Compliance traps",
		snippet: "This chapter mentions transfer and governance.",
		url: "/read/chapters/compliance-traps",
		context: "Compliance traps",
	},
	{
		id: "glossary-transfer-intro",
		type: "glossary",
		label: "Glossary",
		order: 3,
		title: "Transfer",
		snippet: "A short definition.",
		url: "/read/glossary/transfer",
		context: "Glossary of terms",
	},
];

describe("search ranking", () => {
	it("requires every token to match and prioritizes title/context matches", () => {
		const { tokens, results } = buildRankedResults(entries, "transfer success");

		expect(tokens).toEqual(["transfer", "success"]);
		expect(results.map((entry) => entry.id)).toEqual([
			"mechanisms-transfer-success-intro",
		]);
	});

	it("keeps stronger title matches ahead of snippet-only matches", () => {
		const { results } = buildRankedResults(entries, "transfer");

		expect(results.map((entry) => entry.id)).toEqual([
			"mechanisms-transfer-success-intro",
			"glossary-transfer-intro",
			"chapters-compliance-intro",
		]);
	});
});

describe("search groups", () => {
	// An action titled with the query, and chapter sections that mention it.
	const index: SearchEntry[] = [
		...["Why triage first", "The triage loop"].map((section) => ({
			id: `chapters-triage-${section}`,
			type: "chapters",
			label: "Chapters",
			order: 1,
			title: section,
			section,
			snippet: "Classify severity when the pager fires.",
			url: "/read/chapters/triage",
			context: "Triage and escalation",
		})),
		{
			id: "toolkit-classify-alert-severity-intro",
			type: "toolkit",
			label: "Toolkit",
			order: 3,
			title: "Classify severity",
			section: null,
			snippet: "A pager alert fires and no one has stated what it means.",
			url: "/read/toolkit/classify-alert-severity",
			context: "Classify severity",
			text: "Classify as sev-1 and name an owner in the incident thread.",
		},
	];

	it("puts the section with the best match first, whatever the section", () => {
		const { results } = buildRankedResults(index, "severity");
		expect(
			groupRankedResults(results).map(({ label, items }) => [
				label,
				items.length,
			]),
		).toEqual([
			["Toolkit", 1],
			["Chapters", 2],
		]);
	});

	it("matches the words a page shows beyond its preview", () => {
		const { results } = buildRankedResults(index, "sev-1");
		expect(results.map((entry) => entry.id)).toEqual([
			"toolkit-classify-alert-severity-intro",
		]);
	});

	it("ranks a word in a page's lead line above the same word in a section", () => {
		const { results } = buildRankedResults(index, "pager");
		expect(results[0]?.id).toBe("toolkit-classify-alert-severity-intro");
	});
});
