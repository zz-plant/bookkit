import GithubSlugger from "github-slugger";
import { BLOCK_ELEMENTS } from "./html-allowlist";

/**
 * Markdown source read as text, without parsing it: the ids headings get,
 * smart dashes, reference labels, the plain text of Markdown
 * (`stripMarkdown`), and the split into prose and fenced code.
 */

/**
 * Heading ids as the site gives them: Astro's Markdown processor slugs each
 * heading's text with github-slugger, one slugger per page, so a repeated
 * heading gets `-1`, `-2`. Pass the text as the page shows it: code spans
 * as written, other text through `smartDashes`.
 */
export const createHeadingSlugger = () => {
	const slugger = new GithubSlugger();
	return (text: string) => slugger.slug(text);
};

export const createSlugger = () => {
	const used = new Map<string, number>();
	return (value: string) => {
		const base = value
			.toLowerCase()
			.trim()
			.replace(/[`~!@#$%^&*()=+[{}\]\\|;:'",.<>/?]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-/, "")
			.replace(/-$/, "");
		const count = used.get(base) ?? 0;
		used.set(base, count + 1);
		if (!base) return "section";
		return count ? `${base}-${count}` : base;
	};
};

/**
 * Runs of hyphens as the en and em dashes smart punctuation makes of them
 * (CommonMark's rules, which Astro applies to prose but not to code): `--`
 * is an en dash, `---` an em dash, and longer runs mix them, em dashes first.
 */
export const smartDashes = (text: string): string =>
	text.replace(/-{2,}/g, ({ length }) => {
		const [em, en] =
			length % 3 === 0
				? [length / 3, 0]
				: length % 2 === 0
					? [0, length / 2]
					: length % 3 === 2
						? [(length - 2) / 3, 1]
						: [(length - 4) / 3, 2];
		return "\u2014".repeat(em) + "\u2013".repeat(en);
	});

// A code span, or a backslash escape (`\<name\>`, `\*`).
const LITERAL_TEXT = /(`+)([\s\S]*?[^`])\1(?!`)|\\([!-/:-@[-`{-~])/g;
const HELD_TEXT = /\uE000(\d+)\uE001/g;
const TAG_NAME = /^<\/?([A-Za-z][\w.:-]*)/;

/**
 * What a tag leaves in plain text: a space for one that separates words (a
 * block element, `<br>`, `<hr>`, or an MDX component such as `<Callout>`),
 * nothing for an inline one (`<kbd>`, `<em>`), a comment, or an autolink.
 */
const tagText = (tag: string): string => {
	const name = tag.match(TAG_NAME)?.[1];
	if (!name) return "";
	const lower = name.toLowerCase();
	return /^[A-Z]/.test(name) ||
		BLOCK_ELEMENTS.has(lower) ||
		lower === "br" ||
		lower === "hr"
		? " "
		: "";
};

/**
 * Markdown as plain text, for search entries and page descriptions. Code
 * spans keep their text without the backticks, escaped characters keep
 * their character (`\<name\>` is `<name>`), an image keeps its alt text,
 * underscores inside a word (`snake_case`) are not read as emphasis, and
 * HTML tags are left out, a space kept where one separates words.
 */
export const stripMarkdown = (value: string) => {
	const literal: string[] = [];
	// Code and escapes are set aside first, so no other rule reaches into them.
	const held = value
		.replace(/[\uE000\uE001]/g, "")
		.replace(
			LITERAL_TEXT,
			(_, _ticks?: string, code?: string, escaped?: string) => {
				// As CommonMark reads a code span: one space off each end when both have one.
				const text =
					code === undefined
						? (escaped as string)
						: /^ [\s\S]*[^ ][\s\S]* $/.test(code)
							? code.slice(1, -1)
							: code;
				literal.push(text);
				return `\uE000${literal.length - 1}\uE001`;
			},
		);
	// A link's destination may hold balanced parentheses: `(/wiki/Foo_(bar))`.
	return held
		.replace(/!?\[(.*?)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/\*(.*?)\*/g, "$1")
		.replace(
			/(^|[^\p{L}\p{N}_])_{1,3}([^_]+?)_{1,3}(?![\p{L}\p{N}_])/gu,
			"$1$2",
		)
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, tagText)
		.replace(/^\s*[-*+]\s+/g, "")
		.replace(/^\s*\d+\.\s+/g, "")
		.replace(HELD_TEXT, (_, index: string) => literal[Number(index)])
		.trim();
};

/** A run of prose or fenced code; `line` is the 0-based line it starts on. */
export type MarkdownSegment = { code: boolean; text: string; line: number };

/**
 * A line that opens fenced code: three or more backticks (with no backtick
 * in the info string after them) or tildes. MDX has no indented code, so a
 * fence may be indented any amount, as one in a third-level list item is.
 */
export const FENCE_OPENING = /^([ \t]*)(`{3,}(?=[^`]*$)|~{3,})/;
/** A line that can close fenced code: the fence, and nothing after it but spaces. */
const FENCE_CLOSING = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/**
 * Splits Markdown into runs of prose and fenced code, in order. Code runs
 * to a closing fence of the same character, at least as long as the one
 * that opened it, or to the end.
 */
export const splitFencedCode = (markdown: string): MarkdownSegment[] => {
	const segments: MarkdownSegment[] = [];
	let current: MarkdownSegment | null = null;
	let fence: string | null = null;
	markdown.split("\n").forEach((line, index) => {
		const opening = fence ? undefined : line.match(FENCE_OPENING)?.[2];
		const opens = opening !== undefined;
		const code = Boolean(fence) || opens;
		if (opening !== undefined) fence = opening;
		else if (fence) {
			const closing = line.match(FENCE_CLOSING)?.[1];
			if (
				closing &&
				closing[0] === fence[0] &&
				closing.length >= fence.length
			) {
				fence = null;
			}
		}
		// A fence that opens right after another closes starts a new block.
		if (current && current.code === code && !opens) {
			current.text += `\n${line}`;
		} else {
			current = { code, text: line, line: index };
			segments.push(current);
		}
	});
	return segments;
};

/** A reference label as CommonMark matches it: case and runs of spaces ignored. */
export const normalizeLabel = (label: string): string =>
	label.trim().replace(/\s+/g, " ").toLowerCase();
