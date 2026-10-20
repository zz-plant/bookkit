import { splitFencedCode, stripMarkdown } from "../utils/markdown";

/**
 * Two facts about a content file, read from its MDX source:
 *
 * - `excerpt`: the first paragraph of prose, as Markdown on one line, for a
 *   meta description when the author wrote none. `toMetaDescription` makes
 *   it plain text once, as it does a `summary`: text already plain would
 *   lose its `<placeholders>` to a second pass.
 * - `wordCount`: words of prose in the body, so stub chapters can be kept out
 *   of search.
 *
 * They are read from source rather than from the compiled module because
 * Astro's default Markdown processor does not run remark plugins, so nothing
 * can be injected into frontmatter at compile time.
 */

export type PageFacts = { excerpt?: string; wordCount: number };

/** A paragraph shorter than this is a label or a note, not an opening. */
const MIN_EXCERPT_CHARACTERS = 40;

const FRONTMATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Block-level syntax at the start of a line: headings, quotes, list markers (and a task's box). */
const LINE_MARKER =
	/^\s{0,3}(?:#{1,6}\s+|>\s?|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

/** A block that is not a plain paragraph of prose. */
const NON_PARAGRAPH = /^(?:#{1,6}\s|[-*+]\s|>|\||<|\d+[.)]\s)/;

/** A paragraph set entirely in emphasis is an editorial note, not the opening. */
const NOTE = /^([*_]).+\1$/s;

export const countWords = (text: string): number =>
	text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

// Tags are left to stripMarkdown, which skips escaped `\<placeholders\>` and code.
const proseOf = (block: string): string =>
	block
		.split("\n")
		.map((line) => stripMarkdown(line.replace(LINE_MARKER, "")))
		.join(" ");

/** A block's inline Markdown: its lines, without their block markers, on one line. */
const markdownOf = (block: string): string =>
	collapse(
		block
			.split("\n")
			.map((line) => line.replace(LINE_MARKER, ""))
			.join(" "),
	);

export const extractPageFacts = (source: string): PageFacts => {
	// Fenced code (indented or not) leaves an empty line, so the text around it stays two blocks.
	const body = splitFencedCode(source.replace(FRONTMATTER, ""))
		.map((segment) => (segment.code ? "" : segment.text))
		.join("\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(/^(?:import|export)\s.*$/gm, "");

	let wordCount = 0;
	let excerpt: string | undefined;
	for (const raw of body.split(/\r?\n\s*\r?\n/)) {
		const block = raw.trim();
		if (!block) continue;
		const text = collapse(proseOf(block));
		wordCount += countWords(text);
		if (
			!excerpt &&
			!NON_PARAGRAPH.test(block) &&
			!NOTE.test(block) &&
			text.length >= MIN_EXCERPT_CHARACTERS
		) {
			excerpt = markdownOf(block);
		}
	}
	return { excerpt, wordCount };
};

/**
 * Facts for one globbed content module, read from the raw-source glob with the
 * same keys (`contentRawModules` next to `contentModules`).
 */
export const pageFactsForModule = <TModule>(
	modules: Record<string, TModule>,
	rawModules: Record<string, string> | undefined,
	module: TModule | null | undefined,
): PageFacts | null => {
	if (!module || !rawModules) return null;
	const path = Object.keys(modules).find((key) => modules[key] === module);
	const source = path ? rawModules[path] : undefined;
	return typeof source === "string" ? extractPageFacts(source) : null;
};
