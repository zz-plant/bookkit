import { describe, expect, it } from "bun:test";
import { SITE_HEADING_IDS } from "./fixtures/site-heading-ids";
import { markdownHeadings } from "./markdown-headings";

const OUTLINE = [
	"# Title",
	"",
	"#### Failure Modes ##",
	"",
	"Escalation",
	"----------",
	"",
	"Two-line",
	"setext heading",
	"===",
	"",
	"```md",
	"## In a fence",
	"```",
	"",
	"- a list item",
	"---",
	"",
	"#hashtag is a paragraph",
	"",
	"####### seven is too many",
	"",
	"## C# \\#",
	"## Ends in #",
	"",
	"Title",
	"-----",
].join("\n");

describe("markdownHeadings", () => {
	it("gives each heading the id the site gives it", () => {
		const body = SITE_HEADING_IDS.map(([text]) =>
			text.startsWith("<") ? text : `## ${text}`,
		).join("\n\n");
		expect(markdownHeadings(body).map((heading) => heading.id)).toEqual(
			SITE_HEADING_IDS.flatMap(([, id]) => (id === null ? [] : [id])),
		);
	});

	it("reads every level and setext headings, and nothing in code or other blocks", () => {
		const body = OUTLINE;
		expect(
			markdownHeadings(body).map(({ depth, text, id }) => [depth, text, id]),
		).toEqual([
			[1, "Title", "title"],
			[4, "Failure Modes", "failure-modes"],
			[2, "Escalation", "escalation"],
			[1, "Two-line setext heading", "two-line-setext-heading"],
			[2, "C# #", "c-"],
			[2, "Ends in", "ends-in"],
			[2, "Title", "title-1"],
		]);
	});

	it("reads headings nested in a list item or a <details>, as the site gives them ids", () => {
		const body = [
			"## Steps",
			"",
			"1. Drain the node.",
			"",
			"    ## Ownership",
			"",
			"- Outer",
			"  - Inner",
			"",
			"    ## Trigger",
			"",
			"<details>",
			"<summary>More</summary>",
			"",
			"### Verification",
			"",
			"### Steps",
			"",
			"</details>",
		].join("\n");
		expect(
			markdownHeadings(body).map(({ depth, text, id }) => [depth, text, id]),
		).toEqual([
			[2, "Steps", "steps"],
			[2, "Ownership", "ownership"],
			[2, "Trigger", "trigger"],
			[3, "Verification", "verification"],
			[3, "Steps", "steps-1"],
		]);
	});
});
