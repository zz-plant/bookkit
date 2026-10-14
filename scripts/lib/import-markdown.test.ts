import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import { checkContentItem } from "../../packages/astro-bookkit/src/validators/content-check";
import { importChapter } from "./import-markdown";

// A page as wikis and blogs export it.
const EXPORTED = `---
title: 'Refund queue: stuck'
description: What to do when refunds back up.
tags: [payments]
---
# Refund queue: stuck

<!-- reviewed 2026-03 -->
Page <payments-lead> when depth > 500 in {env}.
`;

describe("importChapter", () => {
	it("keeps the source's title and summary in one frontmatter block", () => {
		const chapter = importChapter("payments/refunds.md", EXPORTED, "refunds");
		expect(chapter.title).toBe("Refund queue: stuck");
		expect(chapter.summary).toBe("What to do when refunds back up.");
		expect(chapter.source.match(/^---$/gm)).toHaveLength(2);
		expect(chapter.source).not.toContain("# Refund queue");
		expect(chapter.source).not.toContain("tags:");
	});

	it("writes a chapter that passes the contract and compiles as MDX", async () => {
		const chapter = importChapter("payments/refunds.md", EXPORTED, "refunds");
		expect(checkContentItem("chapter", chapter.source).findings).toEqual([]);
		const body = chapter.source.replace(/^---[\s\S]*?\n---\n/, "");
		await expect(compile(body)).resolves.toBeDefined();
		expect(chapter.changes).toMatchObject({ htmlComments: 1, tags: 1 });
	});

	it("takes the title from a leading heading, then the file name", () => {
		expect(importChapter("a.md", "# Drain a node\n\nText.", "a").title).toBe(
			"Drain a node",
		);
		expect(importChapter("02_node-drain.md", "Text.", "b").title).toBe(
			"Node drain",
		);
	});

	it("keeps unreadable frontmatter as text instead of dropping it", () => {
		const chapter = importChapter("x.md", "---\ntitle: [oops\n---\nBody", "x");
		expect(chapter.unreadableFrontmatter).toBeDefined();
		expect(chapter.source).toContain("title: [oops");
	});
});
