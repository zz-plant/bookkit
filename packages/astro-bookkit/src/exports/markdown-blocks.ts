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

/** MDX source without its author comments (the braced comments scaffolds leave). */
export const dropMdxComments = (body: string): string =>
	body.replace(MDX_COMMENT, "");

/** MDX source as the Markdown a reader sees: author comments dropped, MDX escapes undone. */
export const mdxToMarkdown = (body: string): string =>
	dropMdxComments(body).replace(MDX_ESCAPE, "$1");

/** An image in Markdown (`![alt](src "title")`) or HTML (`<img src alt>`). */
export type InlineImage = { alt: string; src: string };

const CODE_SPAN = "(`+)[\\s\\S]*?\\1";
const MARKDOWN_IMAGE = `!\\[([^\\]]*)\\]\\(\\s*<?([^)\\s>]+)>?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`;
// `[![alt](src)](href)`: the PDF draws the image and drops the link around it.
const LINKED_IMAGE = `\\[\\s*${MARKDOWN_IMAGE}\\s*\\]\\([^)\\s]+(?:\\s+"[^"]*")?\\)`;
const IMG_TAG = "<img\\b[^>]*>";

const decodeEntities = (value: string) =>
	value
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

const tagAttribute = (tag: string, name: string): string | undefined => {
	const match = tag.match(
		new RegExp(
			`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
			"i",
		),
	);
	const value = match?.[1] ?? match?.[2] ?? match?.[3];
	return value === undefined ? undefined : decodeEntities(value);
};

/**
 * Each image in `text` that is not inside a code span, with where it is.
 * `linked` also takes an image wrapped in a link as one image.
 */
const findImages = (text: string, linked: boolean) => {
	const pattern = new RegExp(
		[CODE_SPAN, linked ? LINKED_IMAGE : null, MARKDOWN_IMAGE, IMG_TAG]
			.filter(Boolean)
			.join("|"),
		"gi",
	);
	const found: Array<{ index: number; length: number; image: InlineImage }> =
		[];
	for (const match of text.matchAll(pattern)) {
		if (match[1] !== undefined) continue;
		const [whole] = match;
		const groups = match.slice(2).filter((group) => group !== undefined);
		const image: InlineImage | null = whole.startsWith("<")
			? (() => {
					const src = tagAttribute(whole, "src");
					return src ? { src, alt: tagAttribute(whole, "alt") ?? "" } : null;
				})()
			: { alt: groups[0] ?? "", src: groups[1] ?? "" };
		if (image?.src) {
			found.push({ index: match.index ?? 0, length: whole.length, image });
		}
	}
	return found;
};

/** `text` with each image outside code spans replaced by what `render` returns for it. */
export const replaceImages = (
	text: string,
	render: (image: InlineImage) => string,
): string => {
	let out = "";
	let at = 0;
	for (const { index, length, image } of findImages(text, false)) {
		out += text.slice(at, index) + render(image);
		at = index + length;
	}
	return out + text.slice(at);
};

/** `text` split around its images, in order; text without images comes back as one string. */
export const splitImages = (text: string): Array<string | InlineImage> => {
	const parts: Array<string | InlineImage> = [];
	let at = 0;
	for (const { index, length, image } of findImages(text, true)) {
		const before = text.slice(at, index);
		if (before.trim()) parts.push(before);
		parts.push(image);
		at = index + length;
	}
	const rest = text.slice(at);
	if (rest.trim() || parts.length === 0) parts.push(rest);
	return parts;
};

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
