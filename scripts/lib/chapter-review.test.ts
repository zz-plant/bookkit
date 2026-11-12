import { describe, expect, it } from "bun:test";
import {
	REVIEW_RULES,
	readReview,
	reviewPrompt,
	ruleName,
} from "./chapter-review";
import type { DraftBriefInput } from "./draft-brief";

const input: DraftBriefInput = {
	bookTitle: "Tiny",
	stance: "Delay is chosen.",
	stub: "---\nslug: the-stall\ntitle: The Stall\n---\n\n## Claim\n\nA stall is a decision.\n",
	outline: [{ title: "The Stall", current: true }],
	bound: [
		{
			slug: "slow-walk",
			title: "Slow walk",
			definition: "Processing a request at a crawl on purpose.",
			is: ["A pace someone chose."],
			isNot: ["A backlog nobody controls."],
			tests: [],
		},
	],
	others: [
		{
			slug: "queue-reset",
			title: "Queue reset",
			definition: "Starting a wait over.",
		},
	],
	glossary: ["slack"],
	notes: [],
	targetWords: 300,
	minimumWords: 60,
};

describe("reviewPrompt", () => {
	it("gives the reviewer the chapter, its contracts, and the rules, and nothing about drafting", () => {
		const prompt = reviewPrompt(input);
		expect(prompt).toContain("<chapter>\n---\nslug: the-stall");
		expect(prompt).toContain("### Slow walk (`slow-walk`)");
		expect(prompt).toContain("- A backlog nobody controls.");
		expect(prompt).toContain("`queue-reset` — Queue reset");
		expect(prompt).toContain(`1. ${REVIEW_RULES[0]}`);
		expect(prompt).not.toContain("planned section");
		expect(prompt).not.toContain("<sample>");
	});
});

describe("readReview", () => {
	it("takes the findings out of a reply with prose around it", () => {
		expect(
			readReview(
				'Here:\n{"findings":[{"rule":0,"where":"## Reframe","what":"Calls it designed.","fix":"Say it lands."}]}\nDone.',
			),
		).toEqual({
			findings: [
				{
					rule: 0,
					where: "## Reframe",
					what: "Calls it designed.",
					fix: "Say it lands.",
				},
			],
		});
	});

	it("keeps an empty list, drops findings with nothing to say, and files an unknown rule under the contract", () => {
		expect(readReview('{"findings":[]}')).toEqual({ findings: [] });
		expect(
			readReview('{"findings":[{"what":""},"x",{"rule":9,"what":"Odd."}]}'),
		).toEqual({ findings: [{ rule: 0, where: "", what: "Odd.", fix: "" }] });
	});

	it("refuses a reply with no JSON or no findings list", () => {
		expect(readReview("Looks fine to me.")).toEqual({
			error: "the reply holds no JSON object",
		});
		expect(readReview('{"ok":true}')).toEqual({
			error: "the reply has no findings list",
		});
	});
});

describe("ruleName", () => {
	it("names each rule, and 0 as the contract", () => {
		expect(ruleName(0)).toBe("a mechanism's contract");
		expect(ruleName(2)).toBe("mechanisms");
	});
});
