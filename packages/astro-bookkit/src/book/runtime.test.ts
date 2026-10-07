import { describe, expect, it } from "bun:test";

import { createBookRuntime } from "./runtime";

describe("createBookRuntime", () => {
	it("builds shared helpers and route wrappers from a single bootstrap call", async () => {
		const runtime = createBookRuntime({
			bookConfig: {
				slug: "test-book",
				title: "Test Book",
				status: "draft",
				site: {
					defaultMeta: {
						description: "A book for testing.",
					},
				},
			},
			modules: {
				contentModules: {
					chapters: {
						"../content/book/chapters/one.mdx": {
							frontmatter: { slug: "chapter-one" },
						},
					},
					mechanisms: {},
					toolkit: {},
					glossary: {},
					examples: {},
				},
				contentRawModules: {
					chapters: {
						"../content/book/chapters/one.mdx": `---
title: Chapter One
slug: chapter-one
---

# Chapter one`,
					},
					mechanisms: {},
					toolkit: {},
					glossary: {},
					examples: {},
				},
				releaseModules: {
					"../content/book/releases/2024-10-01.mdx": {
						frontmatter: {
							version: "0.2.0",
							title: "Release",
							date: "2024-10-01",
							summary: "Summary",
						},
					},
				},
			},
			releaseNotes: {
				latestLabel: "Current",
			},
		});

		expect(runtime.chapterExportSlugs).toEqual(["chapter-one"]);
		expect(runtime.getReleaseNotes()[0].version).toBe("0.2.0");
		expect(runtime.getVersionEntries()[0].label).toBe("Current");
		expect(runtime.getOgImageForPath("/release-notes")).toBe(
			"/og/release-notes.svg",
		);

		const pdfResponse = await runtime.exportRoutes.book.pdf.GET();
		expect(pdfResponse.headers.get("Content-Type") ?? "").toContain(
			"application/pdf",
		);

		const chapterResponse = await runtime.exportRoutes.chapters.epub.GET({
			params: { slug: "chapter-one" },
		});
		expect(chapterResponse.headers.get("Content-Type") ?? "").toContain(
			"application/epub+zip",
		);

		const missingResponse = await runtime.exportRoutes.chapters.pdf.GET({
			params: { slug: "missing" },
		});
		expect(missingResponse.status).toBe(404);
	});
});
