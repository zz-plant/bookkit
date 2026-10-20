import { describe, expect, it } from "bun:test";
import { countWords, extractPageFacts, pageFactsForModule } from "./pageFacts";

const source = `---
slug: rollback-first
title: "Rollback first"
---
import Callout from "../components/Callout.astro";

## Why rollback comes first

Short note.

The rollback decision cannot be made **safely** under [load](/read/glossary/load).

- No candidate, no go-live.

\`\`\`sh
echo "not prose words here"
\`\`\`

<Callout>Check the candidate.</Callout>
`;

describe("extractPageFacts", () => {
	it("counts prose words and skips frontmatter, imports, and code", () => {
		// heading 4 + "Short note." 2 + paragraph 9 + list 4 + callout 3
		expect(extractPageFacts(source).wordCount).toBe(22);
	});

	it("counts and keeps the words of inline code", () => {
		const facts = extractPageFacts(
			"Restart `checkout-api` only after you page the `on-call` lead for `payments`.",
		);
		expect(facts.wordCount).toBe(11);
		expect(facts.excerpt).toBe(
			"Restart `checkout-api` only after you page the `on-call` lead for `payments`.",
		);
	});

	it("takes the first paragraph long enough to be an opening, as Markdown", () => {
		expect(extractPageFacts(source).excerpt).toBe(
			"The rollback decision cannot be made **safely** under [load](/read/glossary/load).",
		);
	});

	it("skips headings, lists, and editorial notes when choosing the excerpt", () => {
		const stub = `---
title: Stub
---

## Claim

- A point that is long enough to count as an opening sentence.

*Draft chapter — to be written from blog source posts.*
`;
		expect(extractPageFacts(stub)).toEqual({
			excerpt: undefined,
			wordCount: 22,
		});
	});
});

describe("extractPageFacts with tags, escapes, and code", () => {
	it("counts an escaped placeholder and a tag inside code as words", () => {
		expect(
			extractPageFacts(
				"Replace \\<service-name\\> with the service that pages you, and wrap the timeline in `<details>`.",
			).wordCount,
		).toBe(14);
	});

	it("reads tags as the page shows their words", () => {
		expect(
			extractPageFacts(
				"Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy the alert,<br/>then paste it into the incident log.",
			).wordCount,
		).toBe(13);
	});

	it("skips fenced code however it is indented, and does not count a task's box", () => {
		expect(
			extractPageFacts(
				"- [x] Run it:\n\n    ```sh\n    echo not prose words here\n    ```\n\nDone.",
			).wordCount,
		).toBe(3);
	});
});

describe("countWords", () => {
	it("ignores punctuation-only tokens", () => {
		expect(countWords("Wait — then act, quickly.")).toBe(4);
	});
});

describe("pageFactsForModule", () => {
	it("reads the raw source stored under the module's glob key", () => {
		const module = { frontmatter: { slug: "a" } };
		const facts = pageFactsForModule(
			{ "../chapters/a.mdx": module },
			{ "../chapters/a.mdx": source },
			module,
		);
		expect(facts?.wordCount).toBe(22);
		expect(pageFactsForModule({}, {}, module)).toBeNull();
	});
});
