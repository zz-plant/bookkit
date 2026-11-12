import { describe, expect, it } from "bun:test";

import type { SearchEntry } from "../../search/index";
import { buildRankedResults, resultPlace } from "./search-ranking";

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

describe("results from several sections", () => {
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

	it("lists results in score order whatever their section, the best match first", () => {
		const { results } = buildRankedResults(index, "severity");
		expect(results.map((entry) => entry.id)).toEqual([
			"toolkit-classify-alert-severity-intro",
			"chapters-triage-Why triage first",
			"chapters-triage-The triage loop",
		]);
		const scores = results.map((entry) => entry.score);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
	});

	it("names each result's section, and the page for a heading inside one", () => {
		const [action, ...sections] = buildRankedResults(index, "severity").results;
		expect(resultPlace(action)).toEqual({ section: "Toolkit", trail: null });
		expect(sections.map(resultPlace)).toEqual([
			{
				section: "Chapters",
				trail: "Triage and escalation › Why triage first",
			},
			{ section: "Chapters", trail: "Triage and escalation › The triage loop" },
		]);
		expect(
			resultPlace({
				label: "Glossary",
				title: "Transfer",
				context: "Glossary of terms",
			}),
		).toEqual({ section: "Glossary", trail: "Glossary of terms" });
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

describe("search ranking: a query no page fully matches", () => {
	it("falls back to pages with any of the words, and says so", () => {
		const { results, partial } = buildRankedResults(entries, "transfer zebra");
		expect(partial).toBe(true);
		expect(results.map((entry) => entry.id)).toContain(
			"glossary-transfer-intro",
		);
	});

	it("stays empty when no word matches, and for a single word", () => {
		expect(buildRankedResults(entries, "zebra quagga")).toMatchObject({
			results: [],
			partial: true,
		});
		expect(buildRankedResults(entries, "zebra")).toMatchObject({
			results: [],
			partial: false,
		});
	});
});

describe("search ranking: a book that opens on its actions", () => {
	const chapter: SearchEntry = {
		id: "chapters-rollback",
		type: "chapters",
		label: "Chapters",
		order: 1,
		title: "Rollback first",
		snippet: "Why a rollback comes before a fix.",
		url: "/read/chapters/rollback-first",
		context: "Rollback first",
	};
	const action: SearchEntry = {
		id: "toolkit-rollback",
		type: "toolkit",
		label: "Toolkit",
		order: 2,
		title: "Rollback candidate",
		snippet: "Name the rollback before the deploy.",
		url: "/read/toolkit/rollback-candidate",
		context: "Rollback candidate",
	};

	it("puts the action ahead of a chapter that scores the same", () => {
		const ids = (leadType?: string) =>
			buildRankedResults([chapter, action], "rollback", {
				leadType,
			}).results.map((entry) => entry.id);
		expect(ids()).toEqual(["chapters-rollback", "toolkit-rollback"]);
		expect(ids("toolkit")).toEqual(["toolkit-rollback", "chapters-rollback"]);
	});
});
