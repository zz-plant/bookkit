import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * The reader UI and the author tools build what they show from text: what
 * readers send (feedback, analytics), what the browser keeps
 * (localStorage), the address, and the book's content all reach them, so no
 * script turns a string into HTML or code. Each value goes in with
 * `textContent`, and each element with `createElement`. This test reads
 * every page template and client script for the calls that would.
 */

const root = repoRoot();

/** Where the pages and their scripts are: the engine's components and layouts, the app templates, and each book's pages. */
const SOURCES = [
	"packages/astro-bookkit/src/components",
	"packages/astro-bookkit/src/layouts",
	"packages/astro-bookkit/src/llm-local",
	"packages/astro-bookkit/templates",
	...readdirSync(join(root, "apps")).flatMap((book) => [
		`apps/${book}/src/pages`,
		`apps/${book}/src/layouts`,
	]),
];

/** The pages and scripts under `dir`, tests left out. */
const files = (dir: string): string[] =>
	existsSync(join(root, dir))
		? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
				const path = `${dir}/${entry.name}`;
				if (entry.isDirectory()) return files(path);
				return /\.(astro|ts|js|mjs)$/.test(entry.name) &&
					!/\.test\.ts$/.test(entry.name)
					? [path]
					: [];
			})
		: [];

/** A call that turns a string into HTML or code, and why it is refused. */
const SINKS: Array<{ pattern: RegExp; why: string }> = [
	{
		pattern: /\.(?:inner|outer)HTML\s*\+?=/,
		why: "parses the string as HTML",
	},
	{
		pattern:
			/\b(?:insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe)\s*\(/,
		why: "parses the string as HTML",
	},
	{ pattern: /\bnew\s+DOMParser\b/, why: "parses the string as HTML" },
	{
		pattern: /\bdocument\.write(?:ln)?\s*\(/,
		why: "writes the string into the page as HTML",
	},
	{
		pattern: /\bnew\s+Function\s*\(|\beval\s*\(/,
		why: "runs the string as code",
	},
	{
		pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/,
		why: "runs the string as code",
	},
	{
		pattern: /\.srcdoc\s*=|setAttribute\(\s*["'](?:on[a-z]+|srcdoc|style)["']/i,
		why: "sets an event handler, a document, or inline style from a string",
	},
	{ pattern: /\bset:html\b/, why: "writes the value into the page as HTML" },
];

/** Uses that are safe, each with the reason. */
const ALLOWED: Array<{ file: string; text: string; why: string }> = [
	{
		file: "packages/astro-bookkit/src/layouts/BookLayout.astro",
		text: '<script type="application/ld+json" set:html={structuredDataJson(entry)} />',
		why: "JSON-LD is JSON, not HTML; structuredDataJson writes each < as \\u003c, so a title cannot end the script",
	},
];

describe("the reader UI and author tools", () => {
	it("turn no string into HTML or code", () => {
		const checked = SOURCES.flatMap(files);
		expect(checked.length).toBeGreaterThan(40);
		const found: string[] = [];
		for (const file of checked) {
			readFileSync(join(root, file), "utf8")
				.split("\n")
				.forEach((line, index) => {
					for (const { pattern, why } of SINKS) {
						if (!pattern.test(line)) continue;
						if (
							ALLOWED.some(
								(allowed) =>
									allowed.file === file && line.includes(allowed.text),
							)
						) {
							continue;
						}
						found.push(
							`${file}:${index + 1}: ${line.trim()} — ${why}. Build the elements with document.createElement and set each value with textContent.`,
						);
					}
				});
		}
		expect(found).toEqual([]);
	});
});
