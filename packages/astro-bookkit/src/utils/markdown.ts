/**
 * Markdown read as source text. Each concern has a file of its own, and this
 * one re-exports them, so importers keep one path:
 *
 * - markdown-text.ts: the ids headings get, smart dashes, reference labels,
 *   plain text (`stripMarkdown`), and the split into prose and fenced code.
 * - markdown-tag-scan.ts: one tag or MDX expression read at an offset, as
 *   MDX or as HTML reads it.
 * - markdown-unsafe-finders.ts: the links and the raw HTML the site does not
 *   keep, and what changes in the source to leave each out.
 * - markdown-unsafe.ts: `findUnsafeMarkup`, `withoutUnsafeMarkup`, and
 *   `findUntitledEmbeds`, the scans built on those finders.
 * - markdown-to-mdx.ts: `toMdxBody`, which makes imported Markdown compile
 *   as MDX.
 *
 * The parser the exports, the search index, and the frame check share is in
 * the files beside these: markdown-blocks.ts (blocks), markdown-inline.ts
 * (inline text), markdown-html.ts (raw HTML tags), and markdown-headings.ts
 * (the ids the site gives headings).
 */

export { SPREAD } from "./markdown-tag-scan";
export {
	createHeadingSlugger,
	createSlugger,
	FENCE_OPENING,
	type MarkdownSegment,
	normalizeLabel,
	smartDashes,
	splitFencedCode,
	stripMarkdown,
} from "./markdown-text";
export {
	type MdxBodyOptions,
	type MdxConversion,
	toMdxBody,
} from "./markdown-to-mdx";
export {
	type FindUnsafeMarkupOptions,
	findUnsafeMarkup,
	findUntitledEmbeds,
	markupEntry,
	type UnsafeMarkup,
	type UnsafeMarkupEntry,
	type UntitledEmbed,
	withoutUnsafeMarkup,
} from "./markdown-unsafe";
