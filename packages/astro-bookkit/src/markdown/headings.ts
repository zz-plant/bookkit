import { createSlugger, stripMarkdown } from "../utils/markdown";

export type HeadingEntry = {
	depth: number;
	slug: string;
	text: string;
};

/**
 * Extracts headings (h2, h3) from markdown raw text statically.
 */
export function extractHeadingsFromMarkdown(markdown: string): HeadingEntry[] {
	const slugger = createSlugger();
	const headings: HeadingEntry[] = [];
	const lines = markdown.split("\n");

	for (const line of lines) {
		const match = line.trim().match(/^(#{2,3})\s+(.*)$/);
		if (!match) continue;

		const depth = match[1].length;
		const rawText = match[2].replace(/#+\s*$/, "").trim();
		const cleanText = stripMarkdown(rawText).replace(/^\d+[.)\s-]+/, "");
		const slug = slugger(cleanText);

		headings.push({
			depth,
			slug,
			text: cleanText,
		});
	}

	return headings;
}
