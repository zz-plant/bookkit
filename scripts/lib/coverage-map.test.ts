import { describe, expect, it } from "bun:test";
import {
	buildCoverageMap,
	type CoverageInput,
	formatCoverageMap,
} from "./coverage-map";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const source = (n: number) => `---\nslug: a\ntitle: "A"\n---\n\n${words(n)}\n`;

const input = (overrides: Partial<CoverageInput> = {}): CoverageInput => ({
	book: "fixture",
	title: "Fixture Book: A Subtitle",
	chapters: [
		{ file: "/x/10-later.mdx", source: source(80), mechanisms: [] },
		{ file: "/x/02-early.mdx", source: source(20), mechanisms: ["queue"] },
		{
			file: "/x/00-overview.mdx",
			source: source(200),
			mechanisms: ["queue", "gate", "missing"],
		},
	],
	mechanisms: [
		{ slug: "queue", title: "Queue" },
		{ slug: "gate", title: "Gate" },
		{ slug: "slack", title: "Slack" },
	],
	corpusBooks: [{ book: "other", mechanisms: ["gate", "elsewhere"] }],
	...overrides,
});

describe("buildCoverageMap", () => {
	it("orders chapters as the book reads and labels each by its file's number", () => {
		const map = buildCoverageMap(input());
		expect(
			map.chapters.map((chapter) => [chapter.file, chapter.label]),
		).toEqual([
			["00-overview.mdx", "00"],
			["02-early.mdx", "02"],
			["10-later.mdx", "10"],
		]);
	});

	it("labels an unnumbered chapter by its place in the book", () => {
		const map = buildCoverageMap(
			input({
				chapters: [
					{ file: "intro.mdx", source: source(80), mechanisms: [] },
					{ file: "method.mdx", source: source(80), mechanisms: [] },
				],
			}),
		);
		expect(map.chapters.map((chapter) => chapter.label)).toEqual(["1", "2"]);
	});

	it("keeps a slug the book does not define out of binds, and counts stubs as bookkit check does", () => {
		const [overview, early, later] = buildCoverageMap(input()).chapters;
		expect(overview).toMatchObject({
			words: 200,
			stub: false,
			binds: ["queue", "gate"],
			unknown: ["missing"],
		});
		expect(early).toMatchObject({ words: 20, stub: true, binds: ["queue"] });
		expect(later).toMatchObject({ words: 80, stub: false, binds: [] });
	});

	it("lists each mechanism's chapters and the corpus books that define it too", () => {
		const map = buildCoverageMap(input());
		expect(map.mechanisms).toEqual([
			{
				slug: "gate",
				title: "Gate",
				chapters: ["00-overview.mdx"],
				sharedWith: ["other"],
			},
			{
				slug: "queue",
				title: "Queue",
				chapters: ["00-overview.mdx", "02-early.mdx"],
				sharedWith: [],
			},
			{ slug: "slack", title: "Slack", chapters: [], sharedWith: [] },
		]);
	});
});

describe("formatCoverageMap", () => {
	it("draws a mechanism by chapter grid, with stubs marked under their chapters", () => {
		const lines = formatCoverageMap(buildCoverageMap(input()));
		expect(lines.slice(0, 2)).toEqual([
			"fixture · Fixture Book",
			"3 chapters (1 stub) · 3 mechanisms",
		]);
		expect(lines).toContain("                         00 02 10");
		expect(lines).toContain("  gate                    ●  ·  ·  1");
		expect(lines).toContain("  queue                   ●  ●  ·  2");
		expect(lines).toContain("  slack                   ·  ·  ·  0");
		expect(lines).toContain("  stub (under 60 words)      s");
	});

	it("names the chapters that bind nothing, with their words, and the mechanisms nothing binds", () => {
		const lines = formatCoverageMap(buildCoverageMap(input()));
		expect(lines).toContain("  Chapters that bind no mechanism (1 of 3):");
		expect(lines).toContain("    10-later  80 words");
		expect(lines).toContain("  Mechanisms no chapter binds: slack.");
		expect(lines).toContain(
			"  Shared with other books of the corpus: gate (other).",
		);
		expect(lines.join("\n")).toContain(
			"Listed in mechanisms: but not a mechanism of this book: missing (00).",
		);
	});

	it("leaves no trailing spaces, and no stub row when the book turns stubs off", () => {
		const lines = formatCoverageMap(
			buildCoverageMap(input({ site: { minIndexableWords: 0 } })),
		);
		expect(lines.every((line) => line === line.trimEnd())).toBe(true);
		expect(lines.some((line) => line.includes("stub"))).toBe(false);
	});

	it("says none when every chapter binds a mechanism and every mechanism is bound", () => {
		const lines = formatCoverageMap(
			buildCoverageMap(
				input({
					chapters: [
						{ file: "01-a.mdx", source: source(80), mechanisms: ["queue"] },
					],
					mechanisms: [{ slug: "queue", title: "Queue" }],
					corpusBooks: [],
				}),
			),
		);
		expect(lines.some((line) => line.includes("bind no mechanism"))).toBe(
			false,
		);
		expect(lines).toContain("  Mechanisms no chapter binds: none.");
	});

	it("points a book with no chapters at new chapter", () => {
		const lines = formatCoverageMap(
			buildCoverageMap(input({ chapters: [], mechanisms: [] })),
		);
		expect(lines.at(-1)).toBe(
			'No chapters yet: bun run bookkit new chapter fixture "<title>".',
		);
	});
});
