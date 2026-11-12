import { describe, expect, it } from "bun:test";
import {
	definePrompt,
	emptyFields,
	evidenceFor,
	fillMechanism,
	readDefinition,
} from "./mechanism-define";

const DRAFT = `---
slug: context-debt
title: "Context debt"
definition: ""
is: []
isNot: []
predictions: []
tests: ["Ask who wrote the handoff."]
status: draft
---

{/* Draft from proposal m1. */}
`;

const fields = {
	definition: "Handoffs that drop what the next person needs.",
	is: ["A ticket closed with no notes."],
	isNot: ["A handoff the next person never needed."],
	predictions: [],
	tests: ["Ask the next person what they had to rediscover."],
};

describe("evidenceFor", () => {
	it("takes sentences that use the title or the slug's words, spread across chapters first", () => {
		const evidence = evidenceFor(
			{ slug: "context-debt", title: "Context debt" },
			[
				{
					file: "/b/01-a.mdx",
					body: "Context debt compounds. It grows. Context debt hides.",
				},
				{
					file: "/b/02-b.mdx",
					body: "Nothing here.\nThe context debt is paid by the night shift.",
				},
			],
			2,
		);
		expect(evidence).toEqual([
			{ file: "01-a.mdx", sentence: "Context debt compounds." },
			{
				file: "02-b.mdx",
				sentence: "The context debt is paid by the night shift.",
			},
		]);
	});
});

describe("definePrompt", () => {
	it("gives the writer the book's sentences and the other mechanisms, and says when there are none", () => {
		const prompt = definePrompt({
			bookTitle: "Handoffs",
			mechanism: { slug: "context-debt", title: "Context debt" },
			evidence: [{ file: "01-a.mdx", sentence: "Context debt compounds." }],
			others: [
				{
					slug: "slow-walk",
					title: "Slow walk",
					definition: "A chosen crawl.",
				},
			],
		});
		expect(prompt).toContain("- 01-a.mdx: Context debt compounds.");
		expect(prompt).toContain("- Slow walk: A chosen crawl.");
		expect(
			definePrompt({
				bookTitle: "H",
				mechanism: { slug: "x", title: "X" },
				evidence: [],
				others: [],
			}),
		).toContain("never use it by name");
	});
});

describe("readDefinition", () => {
	it("reads the fields out of a reply with prose around it", () => {
		expect(readDefinition(`Sure:\n${JSON.stringify(fields)}\n`)).toEqual(
			fields,
		);
	});

	it("refuses a reply without a definition, an is, or an isNot", () => {
		expect(readDefinition("no")).toEqual({
			error: "the reply holds no JSON object",
		});
		expect(readDefinition('{"is":["a"],"isNot":["b"]}')).toEqual({
			error: "the reply has no definition",
		});
		expect(readDefinition('{"definition":"d","is":["a"]}')).toEqual({
			error: "the reply needs at least one is and one isNot",
		});
	});
});

describe("fillMechanism", () => {
	it("fills only the empty fields and keeps the body", () => {
		expect(emptyFields(DRAFT)).toEqual([
			"definition",
			"is",
			"isNot",
			"predictions",
		]);
		const { source, filled } = fillMechanism(DRAFT, fields);
		expect(filled).toEqual(["definition", "is", "isNot"]);
		expect(source).toContain("Handoffs that drop what the next person needs.");
		// The author's test stays; the writer's is not written over it.
		expect(source).toContain("Ask who wrote the handoff.");
		expect(source).not.toContain("had to rediscover");
		expect(source).toContain("{/* Draft from proposal m1. */}");
		expect(emptyFields(source)).toEqual(["predictions"]);
	});
});
