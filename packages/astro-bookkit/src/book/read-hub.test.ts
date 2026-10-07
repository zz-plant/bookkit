import { describe, expect, it } from "bun:test";

import { createLocalizedReadHubSectionSummaries } from "./read-hub";

describe("read hub section summaries", () => {
	it("computes localized section stats and entries from required section groups", () => {
		const summaries = createLocalizedReadHubSectionSummaries(
			{
				chapters: {
					"chapters/en.mdx": { frontmatter: { slug: "overview" } },
					"chapters/es.mdx": {
						frontmatter: { slug: "overview", locale: "es" },
					},
					"chapters/chapter-1-en.mdx": { frontmatter: { slug: "chapter-1" } },
				},
				mechanisms: {
					"mechanisms/en.mdx": { frontmatter: { slug: "mechanism-1" } },
				},
				toolkit: {
					"toolkit/en.mdx": { frontmatter: { slug: "tool-1" } },
				},
				glossary: {
					"glossary/en.mdx": { frontmatter: { slug: "term-1" } },
				},
				examples: {
					"examples/en.mdx": { frontmatter: { slug: "example-1" } },
				},
			},
			{ locale: "es", defaultLocale: "en" },
		);

		expect(summaries.chapters.count).toBe(2);
		expect(summaries.chapters.completeness).toBe(0.5);
		expect(summaries.chapters.entries).toHaveLength(2);
		expect(summaries.chapters.entries.map((entry) => entry.slug)).toEqual([
			"chapter-1",
			"overview",
		]);
		expect(
			summaries.chapters.entries.filter((entry) => entry.isFallback),
		).toHaveLength(1);

		expect(summaries.mechanisms.count).toBe(1);
		expect(summaries.toolkit.count).toBe(1);
		expect(summaries.glossary.count).toBe(1);
		expect(summaries.examples.count).toBe(1);
	});
});
