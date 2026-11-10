import { attributeRefusal } from "./html-allowlist";
import { closingBrace, readTag } from "./markdown-tag-scan";
import { splitFencedCode } from "./markdown-text";
import {
	type Edit,
	type Found,
	type MarkupKind,
	unsafeHtml,
	unsafeMarkdownLinks,
} from "./markdown-unsafe-finders";

/**
 * The scans of Markdown or MDX source: what the site leaves out
 * (`findUnsafeMarkup`), the source without it (`withoutUnsafeMarkup`), and
 * the embeds it keeps that have no title (`findUntitledEmbeds`).
 */

/**
 * Something in Markdown or MDX source the site does not keep (see
 * `html-allowlist.ts` and `isSafeLink`), where it is, and what takes its
 * place: a link's words, an element's content, or nothing.
 */
export type UnsafeMarkup = Found & {
	/** 1-based line in the source. */
	line: number;
};

/** What a report lists of something left out: what it is, and its line. */
export type UnsafeMarkupEntry = MarkupKind & { line: number };

/** The entry a report lists for `found`, its line moved down by `linesBefore` (the lines above the text it was found in). */
export const markupEntry = (
	{ start: _start, end: _end, edits: _edits, ...entry }: UnsafeMarkup,
	linesBefore = 0,
): UnsafeMarkupEntry => ({ ...entry, line: linesBefore + entry.line });

export type FindUnsafeMarkupOptions = {
	/**
	 * How tags read: `jsx` (the default, for MDX), where a capitalized name
	 * is a component, braces hold expressions, and every tag is a JSX
	 * element; or `html`, for Markdown notes, where `<IFRAME SRC>` is an
	 * element, as HTML reads it, braces are text, and a tag that is not a
	 * kept or hidden element stays as written (import shows it as text),
	 * losing only an unsafe address.
	 */
	tags?: "jsx" | "html";
};

/** Code, HTML comments, and MDX comments blanked out, keeping every offset. */
const maskNonProse = (markdown: string): string =>
	splitFencedCode(markdown)
		.map(({ code, text }) =>
			code
				? text.replace(/[^\n]/g, " ")
				: text.replace(
						/(`+)[\s\S]*?\1|<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g,
						(span) => span.replace(/[^\n]/g, " "),
					),
		)
		.join("\n");

/**
 * What the site leaves out of Markdown or MDX source, in source order: links
 * to addresses `isSafeLink` refuses (inline, references, and their
 * definitions), and raw HTML the allowlist does not keep (`html-allowlist.ts`):
 * elements, attributes, and, in MDX, expressions and `import`/`export`
 * blocks. Code and comments are not read. Something inside what is left
 * out whole (an element and what it holds, an expression) is not listed,
 * nor is an element left out keeping what it holds inside another (the
 * parts of an `<svg>`). A scan, not a parse: the build applies the same
 * allowlist to the parsed page whatever this finds.
 */
export const findUnsafeMarkup = (
	markdown: string,
	options: FindUnsafeMarkupOptions = {},
): UnsafeMarkup[] => {
	const masked = maskNonProse(markdown);
	const lineAt = (index: number) => markdown.slice(0, index).split("\n").length;
	const holds = new Map<Found, Edit>();
	const wraps = new Map<Found, Edit>();
	const found = [
		...unsafeMarkdownLinks(markdown, masked),
		...unsafeHtml(masked, options.tags !== "html", holds, wraps),
	];
	const within = (each: Found, regions: Map<Found, Edit>) =>
		[...regions].some(
			([owner, region]) =>
				owner !== each && region.start <= each.start && each.end <= region.end,
		);
	const inside = (each: Found) =>
		within(each, holds) ||
		(each.kind === "element" &&
			each.keeps === "contents" &&
			within(each, wraps));
	return found
		.filter((each) => !inside(each))
		.sort((a, b) => a.start - b.start || b.end - a.end)
		.map((each) => ({ ...each, line: lineAt(each.start) }));
};

/** `text` with `edits` made; an edit inside another, or overlapping one made before it, is skipped. */
const applyEdits = (text: string, edits: readonly Edit[]): string => {
	const chosen: Edit[] = [];
	for (const edit of [...edits].sort(
		(a, b) => a.start - b.start || b.end - a.end,
	)) {
		const last = chosen[chosen.length - 1];
		if (last && edit.start < last.end) continue;
		chosen.push(edit);
	}
	return chosen.reduceRight(
		(out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end),
		text,
	);
};

/**
 * `markdown` with everything `findUnsafeMarkup` finds left out: a link
 * becomes its words, an element what it holds or nothing, and an attribute,
 * expression, or code block goes. Repeated until nothing is left to find,
 * so what leaving one thing out joins up (`<scr<script></script>ipt>`) is
 * found too.
 */
export const withoutUnsafeMarkup = (
	markdown: string,
	options: FindUnsafeMarkupOptions = {},
): string => {
	let text = markdown;
	for (let pass = 0; pass < 10; pass += 1) {
		const found = findUnsafeMarkup(text, options);
		if (found.length === 0) break;
		const next = applyEdits(
			text,
			found.flatMap((each) => each.edits),
		);
		if (next === text) break;
		text = next;
	}
	return text;
};

/** An embed the site keeps that has no title: its `src`, and its 1-based line. */
export type UntitledEmbed = { src: string; line: number };

/**
 * Each `<iframe>` the site keeps (one with a safe `src`) that has no title,
 * or an empty one, in source order. A screen reader names a frame by its
 * title, and check:a11y fails a page holding a frame without one. Import
 * gives each embed a title; one written by hand may have none. Tags are
 * read as `findUnsafeMarkup` reads them, so code, comments, and what an
 * expression holds are skipped, and so is an embed it already reports: a
 * `src` the site removes, or a title written as an expression.
 */
export const findUntitledEmbeds = (
	markdown: string,
	options: FindUnsafeMarkupOptions = {},
): UntitledEmbed[] => {
	const masked = maskNonProse(markdown);
	const jsx = options.tags !== "html";
	const found: UntitledEmbed[] = [];
	for (let index = 0; index < masked.length; index += 1) {
		const char = masked[index];
		if (char === "\\") {
			index += 1;
		} else if (jsx && char === "{") {
			const end = closingBrace(masked, index);
			if (end >= 0) index = end;
		} else if (char === "<") {
			const tag = readTag(masked, index, jsx);
			if (!tag) continue;
			index = tag.end - 1;
			// In MDX a capitalized name is a component.
			const element = jsx && !/^[a-z]/.test(tag.name) ? "" : tag.name;
			if (tag.closing || element.toLowerCase() !== "iframe") continue;
			const attribute = (name: string) =>
				tag.attributes.find((each) => each.name?.toLowerCase() === name);
			const src = attribute("src")?.value?.trim();
			if (!src || attributeRefusal("iframe", "src", src)) continue;
			const title = attribute("title");
			if (title && (title.value === null || title.value.trim())) continue;
			found.push({
				src,
				line: markdown.slice(0, tag.start).split("\n").length,
			});
		}
	}
	return found;
};
