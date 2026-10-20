import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { splitFencedCode } from "../utils/markdown";

/**
 * The Markdown both export formats understand, parsed once so the PDF and
 * the EPUB agree on what a heading, list, quote, code block, table, or
 * footnote is. Inline Markdown is parsed by markdown-inline.ts.
 */

/** A table column's alignment, from its delimiter row (`:---`, `:---:`, `---:`). */
export type TableAlign = "left" | "center" | "right" | null;

export type MarkdownBlock =
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; ordered: boolean; items: string[] }
	| { type: "quote"; text: string }
	| { type: "code"; text: string }
	| {
			type: "table";
			align: TableAlign[];
			header: string[];
			/** As many cells as the header has, empty where a row has fewer. */
			rows: string[][];
	  };

/** A body's blocks, and the definitions its references point to. */
export type MarkdownDocument = {
	blocks: MarkdownBlock[];
	/** Where each `[label]: url` definition points, by normalized label. */
	links: ReadonlyMap<string, string>;
	/** The paragraphs of each `[^label]: text` footnote, by normalized label. */
	notes: ReadonlyMap<string, string[]>;
};

// `{/* … */}` notes are for authors (scaffolds leave them); readers never see them.
const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;

/** MDX source without its author comments (the braced comments scaffolds leave). */
export const dropMdxComments = (body: string): string =>
	body.replace(MDX_COMMENT, "");

/** A reference label as CommonMark matches it: case and runs of spaces ignored. */
export const normalizeLabel = (label: string): string =>
	label.trim().replace(/\s+/g, " ").toLowerCase();

/** An HTML character reference: `&amp;`, `&#101;`, `&#x65;`. */
export const CHARACTER_REFERENCE =
	"&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});";

/**
 * The character a reference stands for, or null for a name HTML does not
 * define. Code points XML cannot hold (controls, surrogates, noncharacters)
 * become U+FFFD, as CommonMark replaces them.
 */
export const decodeCharacterReference = (reference: string): string | null => {
	const body = reference.slice(1, -1);
	if (!body.startsWith("#")) {
		const named = decodeNamedCharacterReference(body);
		return named === false ? null : named;
	}
	const code = /^#[xX]/.test(body)
		? Number.parseInt(body.slice(2), 16)
		: Number.parseInt(body.slice(1), 10);
	const invalid =
		(code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
		(code >= 0x7f && code < 0xa0) ||
		(code >= 0xd800 && code < 0xe000) ||
		(code >= 0xfdd0 && code < 0xfdf0) ||
		(code & 0xfffe) === 0xfffe ||
		code > 0x10ffff;
	return invalid ? "�" : String.fromCodePoint(code);
};

/** Text with its character references decoded; a name HTML does not define stays as written. */
export const decodeEntities = (value: string): string =>
	value.replace(
		new RegExp(CHARACTER_REFERENCE, "g"),
		(reference) => decodeCharacterReference(reference) ?? reference,
	);

/** An image in Markdown (`![alt](src "title")`) or HTML (`<img src alt>`). */
export type InlineImage = { alt: string; src: string };

const CODE_SPAN = "(`+)[\\s\\S]*?\\1";
/** `![alt](src "title")`: alt, then src. */
export const MARKDOWN_IMAGE = `!\\[([^\\]]*)\\]\\(\\s*<?([^)\\s>]+)>?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`;
export const IMG_TAG = "<img\\b[^>]*>";

/** An attribute's value in an HTML tag, with its character references decoded. */
export const tagAttribute = (tag: string, name: string): string | undefined => {
	const match = tag.match(
		new RegExp(
			`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
			"i",
		),
	);
	const value = match?.[1] ?? match?.[2] ?? match?.[3];
	return value === undefined ? undefined : decodeEntities(value);
};

/** Each image in `text` that is not inside a code span, with where it is. */
const findImages = (text: string) => {
	const pattern = new RegExp(
		[CODE_SPAN, MARKDOWN_IMAGE, IMG_TAG].join("|"),
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
	for (const { index, length, image } of findImages(text)) {
		out += text.slice(at, index) + render(image);
		at = index + length;
	}
	return out + text.slice(at);
};

const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^(\s{0,3})(`{3,}|~{3,})/;
const LINK_DEFINITION =
	/^ {0,3}\[(?!\^)((?:[^\\\]]|\\.)+)\]:[ \t]*(?:<([^<>]*)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*$/;
const NOTE_DEFINITION = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
// A footnote's later paragraphs are indented by four spaces or a tab.
const NOTE_PARAGRAPH = /^(?: {4}|\t)/;
const UNESCAPED_PIPE = /(?<!\\)\|/;
const DELIMITER_CELL = /^:?-+:?$/;

/** A line that starts a block of its own, ending a table or a footnote's paragraph. */
const startsBlock = (trimmed: string) =>
	[HEADING, BULLET, NUMBERED, QUOTE].some((pattern) => pattern.test(trimmed));

/** A table row's cells, outer pipes optional; `\|` is a pipe inside a cell. */
const tableCells = (line: string): string[] => {
	let row = line.trim();
	if (row.startsWith("|")) row = row.slice(1);
	if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
	return row
		.split(UNESCAPED_PIPE)
		.map((cell) => cell.trim().replaceAll("\\|", "|"));
};

/** The column alignments a delimiter row (`| --- | :-: |`) sets, or null for any other line. */
const tableAlign = (line: string | undefined): TableAlign[] | null => {
	if (!line || !UNESCAPED_PIPE.test(line)) return null;
	const cells = tableCells(line);
	if (!cells.every((cell) => DELIMITER_CELL.test(cell))) return null;
	return cells.map((cell) => {
		if (cell.startsWith(":")) return cell.endsWith(":") ? "center" : "left";
		return cell.endsWith(":") ? "right" : null;
	});
};

/** A fenced code segment's content: its fence lines dropped, the fence's indent removed. */
const codeBlock = (segment: string): MarkdownBlock => {
	const lines = segment.split("\n");
	const [, indent = "", fence = "```"] = lines[0].match(FENCE) ?? [];
	const closing =
		lines.length > 1 ? lines[lines.length - 1].match(FENCE)?.[2] : undefined;
	const closed =
		closing !== undefined &&
		closing[0] === fence[0] &&
		closing.length >= fence.length;
	const outdent = new RegExp(`^ {0,${indent.length}}`);
	return {
		type: "code",
		text: lines
			.slice(1, closed ? -1 : undefined)
			.map((line) => line.replace(outdent, ""))
			.join("\n"),
	};
};

/**
 * Headings, paragraphs, bulleted and numbered lists, quotes, fenced code,
 * and GFM tables, one block per run of lines; plus the link and footnote
 * definitions, which are not shown where they are written.
 */
export const parseMarkdown = (markdown: string): MarkdownDocument => {
	const blocks: MarkdownBlock[] = [];
	const links = new Map<string, string>();
	const notes = new Map<string, string[]>();
	let open: MarkdownBlock | null = null;
	const close = () => {
		if (open) blocks.push(open);
		open = null;
	};
	// The footnote being read, and whether a blank line ended its last paragraph.
	let note: { paragraphs: string[]; afterBlank: boolean } | null = null;

	for (const segment of splitFencedCode(markdown)) {
		if (segment.code) {
			close();
			note = null;
			blocks.push(codeBlock(segment.text));
			continue;
		}
		const lines = dropMdxComments(segment.text).split("\n");
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			const trimmed = line.trim();
			if (note) {
				if (!trimmed) {
					note.afterBlank = true;
					continue;
				}
				const { paragraphs } = note;
				if (note.afterBlank && NOTE_PARAGRAPH.test(line)) {
					paragraphs.push(trimmed);
					note.afterBlank = false;
					continue;
				}
				if (
					!note.afterBlank &&
					!startsBlock(trimmed) &&
					!NOTE_DEFINITION.test(line)
				) {
					const last = paragraphs.length - 1;
					paragraphs[last] = paragraphs[last]
						? `${paragraphs[last]} ${trimmed}`
						: trimmed;
					continue;
				}
				note = null;
			}
			if (!trimmed) {
				close();
				continue;
			}
			const noteDefinition = line.match(NOTE_DEFINITION);
			if (noteDefinition) {
				close();
				note = { paragraphs: [noteDefinition[2].trim()], afterBlank: false };
				const label = normalizeLabel(noteDefinition[1]);
				if (!notes.has(label)) notes.set(label, note.paragraphs);
				continue;
			}
			const current = open as MarkdownBlock | null;
			// A definition cannot interrupt a paragraph.
			const linkDefinition =
				current?.type === "paragraph" ? null : line.match(LINK_DEFINITION);
			if (linkDefinition) {
				close();
				const label = normalizeLabel(linkDefinition[1]);
				if (!links.has(label)) {
					links.set(label, linkDefinition[2] ?? linkDefinition[3]);
				}
				continue;
			}
			const align = UNESCAPED_PIPE.test(trimmed)
				? tableAlign(lines[index + 1])
				: null;
			const header = align ? tableCells(trimmed) : [];
			if (align && header.length === align.length) {
				close();
				const rows: string[][] = [];
				index += 2;
				// The table ends at a blank line or a line that starts another block.
				while (
					index < lines.length &&
					lines[index].trim() &&
					!startsBlock(lines[index].trim())
				) {
					const cells = tableCells(lines[index]);
					rows.push(align.map((_, column) => cells[column] ?? ""));
					index += 1;
				}
				index -= 1;
				blocks.push({ type: "table", align, header, rows });
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
				if (current?.type === "list" && current.ordered === ordered) {
					current.items.push(item[1]);
				} else {
					close();
					open = { type: "list", ordered, items: [item[1]] };
				}
				continue;
			}
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
	}
	close();
	return { blocks, links, notes };
};
