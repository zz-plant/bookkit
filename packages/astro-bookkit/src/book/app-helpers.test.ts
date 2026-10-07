import { describe, expect, it } from "bun:test";

import {
	createBookEntryPointsFromModules,
	createChapterExportSlugs,
	createReleaseNoteHelpers,
} from "./app-helpers";

describe("book app helpers", () => {
	it("creates content and release entrypoints from provided module records", () => {
		const entryPoints = createBookEntryPointsFromModules({
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
					"../content/book/chapters/one.mdx": "# Chapter one",
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
		});

		expect(Object.keys(entryPoints.contentModules.chapters)).toEqual([
			"../content/book/chapters/one.mdx",
		]);
		expect(Object.keys(entryPoints.contentRawModules.chapters)).toEqual([
			"../content/book/chapters/one.mdx",
		]);
		expect(Object.keys(entryPoints.releaseModules)).toEqual([
			"../content/book/releases/2024-10-01.mdx",
		]);
	});

	it("builds reusable release note and version helper functions", () => {
		const helpers = createReleaseNoteHelpers(
			{
				"../content/book/releases/2024-10-01.mdx": {
					frontmatter: {
						version: "0.2.0",
						title: "Release",
						date: "2024-10-01",
						summary: "Summary",
					},
				},
			},
			{ latestLabel: "Current" },
		);

		const releaseNotes = helpers.getReleaseNotes();
		const versionEntries = helpers.getVersionEntries();

		expect(releaseNotes[0].version).toBe("0.2.0");
		expect(versionEntries[0].label).toBe("Current");
		expect(helpers.releaseModules).toBeTruthy();
	});

	it("extracts chapter export slugs from chapter modules", () => {
		expect(
			createChapterExportSlugs({
				"a.mdx": { frontmatter: { slug: "first" } },
				"b.mdx": { frontmatter: { slug: "" } },
				"c.mdx": {},
			}),
		).toEqual(["first"]);
	});
});
