import { createHeadingSlugger } from "./markdown";
import {
	type MarkdownBlock,
	type MarkdownDocument,
	parseMarkdown,
} from "./markdown-blocks";
import { headingSlugText, parseInline } from "./markdown-inline";

/**
 * Headings and the ids the site gives them, for the EPUB, the PDF, the
 * search index, and the frame check alike, from the one Markdown parse they
 * share.
 */

export type HeadingBlock = Extract<MarkdownBlock, { type: "heading" }>;

/** The blocks nested in `block` (a list item's, a `<details>`'s…), in the order they show. */
export const childBlocks = (block: MarkdownBlock): MarkdownBlock[] => {
	switch (block.type) {
		case "list":
			return block.items.flatMap((item) => item.blocks);
		case "details":
		case "section":
			return block.blocks;
		case "definitions":
			return block.items.flatMap((item) =>
				"blocks" in item ? item.blocks : [],
			);
		default:
			return [];
	}
};

function* inOrder(blocks: MarkdownBlock[]): Generator<MarkdownBlock> {
	for (const block of blocks) {
		yield block;
		yield* inOrder(childBlocks(block));
	}
}

/**
 * The id the site gives each heading, by block. Astro slugs every heading on
 * a page with one github-slugger: every level, nested ones included, so a
 * repeated heading gets `-1`, `-2`. The text is slugged as the page shows it
 * (`headingSlugText`). A heading written as an HTML tag (`<h2>`) gets no id
 * and takes no slug.
 *
 * Each run of blocks is slugged in the order given, so a later run's ids
 * avoid an earlier one's.
 */
export const headingIds = (
	runs: MarkdownBlock[][],
	document: Pick<MarkdownDocument, "links" | "notes">,
): Map<HeadingBlock, string> => {
	const slug = createHeadingSlugger();
	const ids = new Map<HeadingBlock, string>();
	for (const blocks of runs) {
		for (const block of inOrder(blocks)) {
			if (block.type !== "heading" || block.html) continue;
			ids.set(block, slug(headingSlugText(parseInline(block.text, document))));
		}
	}
	return ids;
};

/** A heading of a Markdown page: its level, its text, and the id the site gives it. */
export type MarkdownHeading = { depth: number; text: string; id: string };

/**
 * The headings of a Markdown or MDX body (frontmatter removed), in page
 * order, each with the id the site gives it (`headingIds`): every level,
 * setext headings, and headings nested in a list item or a `<details>`,
 * but nothing in code. A heading written as an HTML tag (`<h2>`) gets no id
 * and is not listed. `text` is what the site slugs: the text the page
 * shows, with smart punctuation's dashes.
 */
export const markdownHeadings = (body: string): MarkdownHeading[] => {
	const document = parseMarkdown(body);
	return [...headingIds([document.blocks], document)].map(([block, id]) => ({
		depth: block.level,
		text: headingSlugText(parseInline(block.text, document)),
		id,
	}));
};

/**
 * A record's Markdown in reading order: its body, and what an export writes
 * from its fields before and after it (see `ExportEntry.fields`).
 */
export type EntryMarkdown = { before?: string; body: string; after?: string };

/**
 * An entry's Markdown as one document, with its headings' ids. Each part is
 * parsed on its own, as the record's page renders its fields apart from its
 * body. A reference may point to a definition in any part; the first one
 * written wins. The body's headings take the ids the page gives them, and
 * the sections written from the fields take theirs after, so a body heading
 * named "Steps" keeps `steps` whatever the fields hold.
 */
export const parseEntryMarkdown = ({
	before = "",
	body,
	after = "",
}: EntryMarkdown): {
	document: MarkdownDocument;
	ids: Map<HeadingBlock, string>;
} => {
	const parts = [before, body, after].map(parseMarkdown);
	const links = new Map<string, string>();
	const notes = new Map<string, string[]>();
	for (const part of parts) {
		for (const [label, url] of part.links) {
			if (!links.has(label)) links.set(label, url);
		}
		for (const [label, paragraphs] of part.notes) {
			if (!notes.has(label)) notes.set(label, paragraphs);
		}
	}
	const document = {
		blocks: parts.flatMap((part) => part.blocks),
		links,
		notes,
	};
	const [fieldsBefore, own, fieldsAfter] = parts;
	const ids = headingIds(
		[own.blocks, fieldsBefore.blocks, fieldsAfter.blocks],
		document,
	);
	return { document, ids };
};
