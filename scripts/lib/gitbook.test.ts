import { describe, expect, it } from "bun:test";
import type { ExportEntry } from "../../packages/astro-bookkit/src/exports/types";
import { gitbookPage, gitbookSummary, mdxToGitbookMarkdown } from "./gitbook";

const chapter = (body: string): ExportEntry => ({
	kind: "chapter",
	slug: "next-steps",
	title: "Next steps",
	body,
});
const pages = new Map([
	["chapter:overview", "chapters/overview.md"],
	["mechanism:triage", "mechanisms/triage.md"],
]);
const convert = (body: string, copied: string[] = []) =>
	mdxToGitbookMarkdown(chapter(body), pages, {
		siteUrl: "https://drill.example/",
		copyImage: (src) => {
			copied.push(src);
			return src.startsWith("/images/")
				? `.gitbook/assets/${src.slice(8)}`
				: null;
		},
	});

describe("mdxToGitbookMarkdown", () => {
	it("drops what only MDX understands and keeps the Markdown", () => {
		expect(
			convert(
				[
					'import Note from "../components/Note.astro";',
					"",
					"{/* Bind the mechanisms this chapter uses. */}",
					"",
					'<Note tone="warm">Keep **one** owner.</Note>',
					"",
					"Escaped \\{braces\\} and \\<placeholders> stay escaped.",
				].join("\n"),
			),
		).toBe(
			"Keep **one** owner.\n\nEscaped \\{braces\\} and \\<placeholders> stay escaped.",
		);
	});

	it("points links to read pages at the exported pages, and other site links at the site", () => {
		expect(
			convert(
				'Read [the overview](/read/chapters/overview#ownership), [triage](/read/mechanisms/triage), [downloads](/downloads), [docs](https://example.com) and <a href="/read/chapters/overview">this</a>.\n\n[ref]: /read/mechanisms/triage',
			),
		).toBe(
			'Read [the overview](overview.md#ownership), [triage](../mechanisms/triage.md), [downloads](https://drill.example/downloads), [docs](https://example.com) and <a href="overview.md">this</a>.\n\n[ref]: ../mechanisms/triage.md',
		);
	});

	it("keeps only the words of a link the site would not keep, and drops an element's unsafe address", () => {
		const copied: string[] = [];
		expect(
			convert(
				[
					"[js](javascript:alert(1)) [ref][bad] [![Logo](/images/logo.png)](data:text/html,x) [web](https://example.com)",
					'<a href="java&#x09;script:alert(2)">html</a> <a {...{ href: "javascript:alert(3)" }}>spread</a> <a href="/read/chapters/overview">page</a>',
					'<iframe src="vbscript:x"></iframe> <iframe srcdoc="<script>alert(4)</script>" src="https://www.youtube.com/embed/abc"></iframe>',
					'<form action="data:text/html,x"><button formaction="javascript:alert(5)">Go</button></form>',
					'<svg><a xlink:href="javascript:alert(6)"><text>svg</text></a></svg>',
					"`[code](javascript:x)`",
					"",
					"[bad]: javascript:alert(7)",
				].join("\n"),
				copied,
			),
		).toBe(
			[
				"js ref ![Logo](../.gitbook/assets/logo.png) [web](https://example.com)",
				'<a>html</a> <a>spread</a> <a href="overview.md">page</a>',
				'<iframe></iframe> <iframe src="https://www.youtube.com/embed/abc"></iframe>',
				"<form><button>Go</button></form>",
				"<svg><a><text>svg</text></a></svg>",
				"`[code](javascript:x)`",
			].join("\n"),
		);
		expect(copied).toEqual(["/images/logo.png"]);
		// The Markdown a record's fields write goes by the same rule.
		expect(
			mdxToGitbookMarkdown(
				{
					...chapter("Body."),
					fields: { before: "Defined in [the note](javascript:alert(8))." },
				},
				pages,
				{ copyImage: () => null },
			),
		).toBe("Defined in the note.\n\nBody.");
	});

	it("copies local images and keeps remote ones, but leaves code as written", () => {
		const copied: string[] = [];
		expect(
			convert(
				[
					'![The board](/images/board.png) and <img src="/images/flow.png" alt="Flow" />',
					"",
					"![Remote](https://example.com/x.png)",
					"",
					"`![not an image](/images/code.png)`",
					"",
					"```md",
					"[link](/read/chapters/overview)",
					"{/* kept in code */}",
					"```",
				].join("\n"),
				copied,
			),
		).toBe(
			[
				"![The board](../.gitbook/assets/board.png) and ![Flow](../.gitbook/assets/flow.png)",
				"",
				"![Remote](https://example.com/x.png)",
				"",
				"`![not an image](/images/code.png)`",
				"",
				"```md",
				"[link](/read/chapters/overview)",
				"{/* kept in code */}",
				"```",
			].join("\n"),
		);
		expect(copied).toEqual([
			"/images/board.png",
			"/images/flow.png",
			"https://example.com/x.png",
		]);
	});
});

describe("gitbookSummary and gitbookPage", () => {
	it("lists each part as a group, with a mechanism's actions under it", () => {
		expect(
			gitbookSummary([
				{
					title: "Chapters",
					entries: [chapter("")],
				},
				{
					title: "Mechanisms and actions",
					entries: [
						{
							kind: "mechanism",
							slug: "triage",
							title: "Triage [core]",
							body: "",
							children: [
								{ kind: "tool", slug: "classify", title: "Classify", body: "" },
							],
						},
					],
				},
			]),
		).toBe(
			[
				"# Summary",
				"",
				"* [Introduction](README.md)",
				"",
				"## Chapters",
				"",
				"* [Next steps](chapters/next-steps.md)",
				"",
				"## Mechanisms and actions",
				"",
				"* [Triage \\[core\\]](mechanisms/triage.md)",
				"  * [Classify](toolkit/classify.md)",
				"",
			].join("\n"),
		);
	});

	it("writes the description as GitBook frontmatter and the title as the heading", () => {
		expect(
			gitbookPage(
				{ ...chapter(""), description: "Where to go: next." },
				"Body.",
			),
		).toBe(
			"---\ndescription: 'Where to go: next.'\n---\n\n# Next steps\n\nBody.\n",
		);
	});
});
