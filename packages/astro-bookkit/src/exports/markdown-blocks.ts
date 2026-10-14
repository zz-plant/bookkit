/**
 * The Markdown both export formats understand, parsed once so the PDF and
 * the EPUB agree on what a heading, list, or quote is.
 */
export type MarkdownBlock =
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; ordered: boolean; items: string[] }
	| { type: "quote"; text: string };

// `{/* … */}` notes are for authors (scaffolds leave them); readers never see them.
const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
// What toMdxBody escapes so MDX renders it as written.
const MDX_ESCAPE = /\\([{}<])/g;

/** MDX source as the Markdown a reader sees: author comments dropped, MDX escapes undone. */
export const mdxToMarkdown = (body: string): string =>
	body.replace(MDX_COMMENT, "").replace(MDX_ESCAPE, "$1");

const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/** Headings, paragraphs, bulleted and numbered lists, and quotes, one block per run of lines. */
export const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
	const blocks: MarkdownBlock[] = [];
	let open: MarkdownBlock | null = null;
	const close = () => {
		if (open) blocks.push(open);
		open = null;
	};

	for (const line of mdxToMarkdown(markdown).split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			close();
			continue;
		}
		const heading = trimmed.match(HEADING);
		if (heading) {
			close();
			blocks.push({
				type: "heading",
				level: heading[1].length,
				text: heading[2],
			});
			continue;
		}
		const item = trimmed.match(BULLET) ?? trimmed.match(NUMBERED);
		if (item) {
			const ordered = !BULLET.test(trimmed);
			const current = open as MarkdownBlock | null;
			if (current?.type === "list" && current.ordered === ordered) {
				current.items.push(item[1]);
			} else {
				close();
				open = { type: "list", ordered, items: [item[1]] };
			}
			continue;
		}
		const current = open as MarkdownBlock | null;
		// An indented line under a list item continues that item.
		if (current?.type === "list" && /^\s/.test(line)) {
			current.items[current.items.length - 1] += ` ${trimmed}`;
			continue;
		}
		const quoted = trimmed.match(QUOTE);
		const type = quoted ? "quote" : "paragraph";
		const text = quoted ? quoted[1] : trimmed;
		if (current?.type === type) {
			current.text = current.text ? `${current.text} ${text}` : text;
		} else {
			close();
			open = { type, text };
		}
	}
	close();
	return blocks;
};
