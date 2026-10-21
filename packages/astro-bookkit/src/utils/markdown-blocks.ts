import {
	FENCE_OPENING,
	normalizeLabel,
	splitFencedCode,
	withoutUnsafeMarkup,
} from "./markdown";
import {
	BLOCK_TAGS,
	HTML_TAG,
	type HtmlTag,
	IMG_TAG,
	readTag,
	tagAlign,
	tagAttribute,
} from "./markdown-html";

/**
 * The Markdown both export formats understand, parsed once so the PDF and
 * the EPUB agree on what a heading, list, quote, code block, table, or
 * footnote is, and on what the HTML blocks import keeps (`<details>`,
 * `<p align>`, HTML tables and lists…) hold. Inline Markdown is parsed by
 * markdown-inline.ts.
 */

/** A column's or block's alignment: a table's delimiter row (`:---`, `:---:`, `---:`), or an HTML `align`. */
export type TableAlign = "left" | "center" | "right" | null;

/**
 * A list item: its first paragraph's text, then what is nested under it
 * (lists, code, paragraphs). A task list item (`- [ ] …`, `- [x] …`) is
 * `checked` or not, its box left out of `text`.
 */
export type ListItem = {
	text: string;
	blocks: MarkdownBlock[];
	checked?: boolean;
};

/** The HTML elements an export keeps around a run of blocks. */
export type SectionTag =
	| "div"
	| "section"
	| "article"
	| "aside"
	| "blockquote"
	| "figure";

export type MarkdownBlock =
	| {
			type: "heading";
			level: number;
			text: string;
			/** Written as an HTML tag (`<h2>`), which the site gives no id. */
			html?: true;
	  }
	| { type: "paragraph"; text: string; align?: TableAlign }
	| { type: "list"; ordered: boolean; start: number; items: ListItem[] }
	| { type: "quote"; text: string }
	| { type: "code"; text: string }
	| {
			type: "table";
			align: TableAlign[];
			/** Null for an HTML table whose first row is not a header. */
			header: string[] | null;
			/** As many cells as the widest row has, empty where a row has fewer. */
			rows: string[][];
			caption?: string;
	  }
	| { type: "rule" }
	/** `<details>`: its summary leads, and its content always shows. */
	| { type: "details"; summary: string | null; blocks: MarkdownBlock[] }
	/** `<dl>`: each term, then the descriptions that follow it. */
	| {
			type: "definitions";
			items: Array<{ term: string } | { blocks: MarkdownBlock[] }>;
	  }
	| {
			type: "section";
			tag: SectionTag;
			align: TableAlign;
			blocks: MarkdownBlock[];
	  }
	/** A `<figcaption>`, first or last in its figure. */
	| { type: "caption"; text: string };

type ListBlock = Extract<MarkdownBlock, { type: "list" }>;

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

/** An image in Markdown (`![alt](src "title")`) or HTML (`<img src alt>`). */
export type InlineImage = { alt: string; src: string };

const CODE_SPAN = "(`+)[\\s\\S]*?\\1";
/** `![alt](src "title")`: alt, then src. */
export const MARKDOWN_IMAGE = `!\\[([^\\]]*)\\]\\(\\s*<?([^)\\s>]+)>?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`;

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
// A list item: its indent, marker (and number), the spaces after it, and its text.
const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})[.)])([ \t]+)(\S.*)$/;
const QUOTE = /^>\s?(.*)$/;
// A line of three or more `-`, `*`, or `_` (spaces between allowed): a rule.
const THEMATIC_BREAK = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
// A line of `=` or `-` under a paragraph makes it a heading, level 1 or 2.
const SETEXT_UNDERLINE = /^[ \t]*(=+|-+)[ \t]*$/;
// A task list item's box, as GFM reads it: `[ ]`, `[x]`, or `[X]`, then a space and the task.
const TASK_BOX = /^\[([ xX])\][ \t]+(?=\S)/;
const LINK_DEFINITION =
	/^ {0,3}\[(?!\^)((?:[^\\\]]|\\.)+)\]:[ \t]*(?:<([^<>]*)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*$/;
const NOTE_DEFINITION = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
// A footnote's later paragraphs are indented by four spaces or a tab.
const NOTE_PARAGRAPH = /^(?: {4}|\t)/;
const UNESCAPED_PIPE = /(?<!\\)\|/;
const DELIMITER_CELL = /^:?-+:?$/;

/** A line that starts a block of its own, ending a table or a footnote's paragraph. */
const startsBlock = (trimmed: string) =>
	[HEADING, THEMATIC_BREAK, BULLET, NUMBERED, QUOTE].some((pattern) =>
		pattern.test(trimmed),
	);

/** The column a line's text starts at, a tab reaching the next multiple of four. */
const indentOf = (whitespace: string) => {
	let column = 0;
	for (const char of whitespace)
		column = char === "\t" ? column + 4 - (column % 4) : column + 1;
	return column;
};

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

/** `line` with up to `columns` columns of its indentation removed, as CommonMark removes a fence's indent from its content. */
const outdent = (line: string, columns: number) => {
	let column = 0;
	let at = 0;
	while (at < line.length && /[ \t]/.test(line[at])) {
		const next = line[at] === "\t" ? column + 4 - (column % 4) : column + 1;
		if (next > columns) break;
		column = next;
		at += 1;
	}
	return line.slice(at);
};

/**
 * A fenced code segment's content (fence lines dropped, the fence's indent
 * removed from each line), and the column the fence starts at, which says
 * which list item, if any, it belongs to.
 */
const codeBlock = (segment: string) => {
	const lines = segment.split("\n");
	const [, whitespace = "", fence = "```"] =
		lines[0].match(FENCE_OPENING) ?? [];
	const last = lines.length > 1 ? lines[lines.length - 1].trim() : "";
	// splitFencedCode ends a segment at its closing fence, or at the end of the body.
	const closed =
		last.length >= fence.length && [...last].every((char) => char === fence[0]);
	const indent = indentOf(whitespace);
	const block: MarkdownBlock = {
		type: "code",
		text: lines
			.slice(1, closed ? -1 : undefined)
			.map((line) => outdent(line, indent))
			.join("\n"),
	};
	return { block, indent };
};

/** Prose, fenced code, or an HTML element holding more of them. */
type Node =
	| { kind: "text"; text: string }
	| { kind: "code"; block: MarkdownBlock; indent: number }
	| { kind: "element"; tag: HtmlTag; children: Node[] };

type Token = Exclude<Node, { kind: "element" }> | { kind: "tag"; tag: HtmlTag };

// Escapes and code spans are passed over, so `\<div>` and `` `<div>` `` stay text.
const BLOCK_SCAN = new RegExp(
	`\\\\[!-/:-@[-\`{-~]|(?<!\`)(\`+)(?!\`)(?:(?!\\n[ \\t]*\\n)[\\s\\S])*?[^\`]\\1(?!\`)|(${HTML_TAG})`,
	"g",
);

/**
 * The body as a tree: prose and fenced code, inside the block-level HTML
 * elements whose tags pair up as HTML nests them. A tag that does not pair
 * is left out, and its content stays where it is.
 */
const blockTree = (markdown: string): Node[] => {
	const tokens: Token[] = [];
	for (const segment of splitFencedCode(markdown)) {
		if (segment.code) {
			tokens.push({ kind: "code", ...codeBlock(segment.text) });
			continue;
		}
		const text = dropMdxComments(segment.text);
		let at = 0;
		for (const match of text.matchAll(BLOCK_SCAN)) {
			const tag = match[2] === undefined ? null : readTag(match[2]);
			if (!tag || !BLOCK_TAGS.has(tag.name)) continue;
			const index = match.index ?? 0;
			if (index > at)
				tokens.push({ kind: "text", text: text.slice(at, index) });
			tokens.push({ kind: "tag", tag });
			at = index + match[0].length;
		}
		if (at < text.length) tokens.push({ kind: "text", text: text.slice(at) });
	}

	const closes = new Map<number, number>();
	const open: number[] = [];
	tokens.forEach((token, index) => {
		if (token.kind !== "tag" || token.tag.empty) return;
		if (!token.tag.closing) {
			open.push(index);
			return;
		}
		const names = open.map((at) => (tokens[at] as { tag: HtmlTag }).tag.name);
		const at = names.lastIndexOf(token.tag.name);
		if (at < 0) return;
		closes.set(open[at], index);
		// Tags opened inside it and never closed are left out.
		open.length = at;
	});

	const build = (from: number, to: number): Node[] => {
		const nodes: Node[] = [];
		for (let index = from; index < to; index += 1) {
			const token = tokens[index];
			if (token.kind !== "tag") {
				nodes.push(token);
				continue;
			}
			if (token.tag.closing) continue;
			if (token.tag.empty) {
				nodes.push({ kind: "element", tag: token.tag, children: [] });
				continue;
			}
			const end = closes.get(index);
			if (end === undefined) continue;
			nodes.push({
				kind: "element",
				tag: token.tag,
				children: build(index + 1, end),
			});
			index = end;
		}
		return nodes;
	};
	return build(0, tokens.length);
};

type Definitions = { links: Map<string, string>; notes: Map<string, string[]> };

/** One open list level: the list, and the column its last item's text starts at. */
type ListLevel = { list: ListBlock; content: number };

/**
 * Reads lines of Markdown into blocks, one block per run of lines. Lists
 * nest by indentation, as CommonMark nests them: an item indented to (or
 * past) the text of the item above it belongs to that item. Fenced code
 * indented that far joins the item too.
 */
const createFlowReader = (definitions: Definitions) => {
	const blocks: MarkdownBlock[] = [];
	let open: MarkdownBlock | null = null;
	// The open list's levels, outermost first; open is levels[0].list.
	let levels: ListLevel[] = [];
	// A blank line came after the list's last line.
	let afterBlank = false;
	// A paragraph inside an item, which more lines continue.
	let itemParagraph: { text: string } | null = null;
	// The footnote being read, and whether a blank line ended its last paragraph.
	let note: { paragraphs: string[]; afterBlank: boolean } | null = null;

	const close = () => {
		if (open) blocks.push(open);
		open = null;
		levels = [];
		afterBlank = false;
		itemParagraph = null;
	};
	const lastItem = (level: ListLevel) =>
		level.list.items[level.list.items.length - 1];
	/** The deepest open level whose item text `indent` reaches, or -1. */
	const levelAt = (indent: number) => {
		let depth = levels.length - 1;
		while (depth >= 0 && indent < levels[depth].content) depth -= 1;
		return depth;
	};
	/** Text continuing the deepest open item (or the paragraph inside it). */
	const continueItem = (text: string) => {
		if (itemParagraph) {
			itemParagraph.text += ` ${text}`;
			return;
		}
		const item = lastItem(levels[levels.length - 1]);
		item.text = item.text ? `${item.text} ${text}` : text;
	};

	const listItem = (match: RegExpMatchArray) => {
		const [, whitespace, marker, number, spaces, text] = match;
		const indent = indentOf(whitespace);
		const ordered = number !== undefined;
		const width = indentOf(whitespace + marker + spaces);
		// Five or more spaces after the marker start indented content, not the text.
		const content =
			width - indent - marker.length > 4 ? indent + marker.length + 1 : width;
		const box = text.match(TASK_BOX);
		const item: ListItem = box
			? { text: text.slice(box[0].length), blocks: [], checked: box[1] !== " " }
			: { text, blocks: [] };
		const start = ordered ? Number(number) : 1;
		const newList = (): ListBlock => ({
			type: "list",
			ordered,
			start,
			items: [item],
		});
		afterBlank = false;
		itemParagraph = null;
		const target = levelAt(indent) + 1;
		if (target === 0 && open?.type !== "list") {
			close();
			open = newList();
			levels = [{ list: open, content }];
			return;
		}
		if (target < levels.length) {
			levels.length = target + 1;
			const level = levels[target];
			if (level.list.ordered === ordered) {
				level.list.items.push(item);
				level.content = content;
				return;
			}
			// Another kind of list at the same depth starts a new list.
			if (target === 0) {
				close();
				open = newList();
				levels = [{ list: open, content }];
				return;
			}
			const list = newList();
			lastItem(levels[target - 1]).blocks.push(list);
			levels[target] = { list, content };
			return;
		}
		const list = newList();
		lastItem(levels[levels.length - 1]).blocks.push(list);
		levels.push({ list, content });
	};

	const lines = (text: string) => {
		const all = text.split("\n");
		for (let index = 0; index < all.length; index += 1) {
			const line = all[index];
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
				// A list goes on past a blank line if an item or indented text follows.
				if (levels.length > 0) {
					afterBlank = true;
					itemParagraph = null;
				} else {
					close();
				}
				continue;
			}
			const noteDefinition = line.match(NOTE_DEFINITION);
			if (noteDefinition) {
				close();
				note = { paragraphs: [noteDefinition[2].trim()], afterBlank: false };
				const label = normalizeLabel(noteDefinition[1]);
				if (!definitions.notes.has(label)) {
					definitions.notes.set(label, note.paragraphs);
				}
				continue;
			}
			const current = open as MarkdownBlock | null;
			// A definition cannot interrupt a paragraph.
			const linkDefinition =
				current?.type === "paragraph" ? null : line.match(LINK_DEFINITION);
			if (linkDefinition) {
				close();
				const label = normalizeLabel(linkDefinition[1]);
				if (!definitions.links.has(label)) {
					definitions.links.set(label, linkDefinition[2] ?? linkDefinition[3]);
				}
				continue;
			}
			const align = UNESCAPED_PIPE.test(trimmed)
				? tableAlign(all[index + 1])
				: null;
			const header = align ? tableCells(trimmed) : [];
			if (align && header.length === align.length) {
				close();
				const rows: string[][] = [];
				index += 2;
				// The table ends at a blank line or a line that starts another block.
				while (
					index < all.length &&
					all[index].trim() &&
					!startsBlock(all[index].trim())
				) {
					const cells = tableCells(all[index]);
					rows.push(align.map((_, column) => cells[column] ?? ""));
					index += 1;
				}
				index -= 1;
				blocks.push({ type: "table", align, header, rows });
				continue;
			}
			// As CommonMark reads them: an underline makes the paragraph above it a
			// heading, which takes a slug on the site; else `---` or `***` is a rule.
			const underline = line.match(SETEXT_UNDERLINE)?.[1];
			if (underline && current?.type === "paragraph") {
				open = null;
				blocks.push({
					type: "heading",
					level: underline[0] === "=" ? 1 : 2,
					text: current.text,
				});
				continue;
			}
			if (THEMATIC_BREAK.test(line)) {
				close();
				blocks.push({ type: "rule" });
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
			const item = line.match(LIST_ITEM);
			if (item) {
				listItem(item);
				continue;
			}
			if (levels.length > 0) {
				const indent = indentOf(line.match(/^[ \t]*/)?.[0] ?? "");
				if (!afterBlank && /^\s/.test(line)) {
					continueItem(trimmed);
					continue;
				}
				// After a blank line, text indented to an item's text is a paragraph in it.
				const depth = levelAt(indent);
				if (afterBlank && depth >= 0) {
					levels.length = depth + 1;
					const paragraph: MarkdownBlock = { type: "paragraph", text: trimmed };
					lastItem(levels[depth]).blocks.push(paragraph);
					itemParagraph = paragraph;
					afterBlank = false;
					continue;
				}
				close();
			}
			const quoted = trimmed.match(QUOTE);
			const type = quoted ? "quote" : "paragraph";
			const lineText = quoted ? quoted[1] : trimmed;
			const block = open as MarkdownBlock | null;
			if (block?.type === type) {
				block.text = block.text ? `${block.text} ${lineText}` : lineText;
			} else {
				close();
				open = { type, text: lineText };
			}
		}
	};

	return {
		lines,
		/** A fenced code block; indented to an open item's text, it belongs to that item. */
		code: (block: MarkdownBlock, indent: number) => {
			note = null;
			const depth = levels.length > 0 ? levelAt(indent) : -1;
			if (depth >= 0) {
				levels.length = depth + 1;
				lastItem(levels[depth]).blocks.push(block);
				afterBlank = false;
				itemParagraph = null;
				return;
			}
			close();
			blocks.push(block);
		},
		/** Blocks from an HTML element, which end whatever was open. */
		add: (added: MarkdownBlock[]) => {
			note = null;
			close();
			blocks.push(...added);
		},
		finish: () => {
			close();
			return blocks;
		},
	};
};

/** Fenced code as a code span, so a block of text can hold it. */
const asCodeSpan = (code: string) => {
	const longest = Math.max(
		0,
		...(code.match(/`+/g) ?? []).map((run) => run.length),
	);
	const fence = "`".repeat(longest + 1);
	return `${fence} ${code.replace(/\n/g, " ")} ${fence}`;
};

/**
 * An element's content as one block of text (a paragraph, heading, term,
 * caption, or table cell): any block elements inside are left out but
 * their text kept, and line breaks become spaces.
 */
const textOf = (nodes: Node[]): string => {
	const parts = nodes.map((node) => {
		if (node.kind === "text") return node.text;
		if (node.kind === "code") {
			return node.block.type === "code" ? asCodeSpan(node.block.text) : "";
		}
		return ` ${textOf(node.children)} `;
	});
	return parts
		.join("")
		.replace(/\s*\n\s*/g, " ")
		.trim();
};

const isBlank = (node: Node) => node.kind === "text" && !node.text.trim();

/** The element children of `nodes` when every other node is blank, else null. */
const onlyElements = (nodes: Node[], names: ReadonlySet<string>) => {
	const elements: Array<Extract<Node, { kind: "element" }>> = [];
	for (const node of nodes) {
		if (isBlank(node)) continue;
		if (node.kind !== "element" || !names.has(node.tag.name)) return null;
		elements.push(node);
	}
	return elements;
};

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const TEXT_BLOCK_TAGS = new Set([
	"p",
	"summary",
	"dt",
	"figcaption",
	"caption",
	"th",
	"td",
]);
const SECTION_TAGS: Readonly<Record<string, SectionTag>> = {
	div: "div",
	center: "div",
	header: "div",
	footer: "div",
	section: "section",
	article: "article",
	aside: "aside",
	blockquote: "blockquote",
	figure: "figure",
};
const LIST_TAGS = new Set(["li"]);
const DEFINITION_TAGS = new Set(["dt", "dd"]);
const TABLE_PART_TAGS = new Set([
	"caption",
	"colgroup",
	"thead",
	"tbody",
	"tfoot",
	"tr",
]);
const ROW_PART_TAGS = new Set(["tr"]);
const CELL_TAGS = new Set(["th", "td"]);

/** A run of nodes as blocks, the element blocks among them in place. */
const flowBlocks = (
	nodes: Node[],
	definitions: Definitions,
): MarkdownBlock[] => {
	const reader = createFlowReader(definitions);
	for (const node of nodes) {
		if (node.kind === "text") reader.lines(node.text);
		else if (node.kind === "code") reader.code(node.block, node.indent);
		else reader.add(elementBlocks(node, definitions));
	}
	return reader.finish();
};

/** A list item from its content's blocks: the first paragraph's text leads. */
const listItemOf = (blocks: MarkdownBlock[]): ListItem => {
	const [first, ...rest] = blocks;
	return first?.type === "paragraph"
		? { text: first.text, blocks: rest }
		: { text: "", blocks };
};

/** An HTML table as a table block, or null when its rows and cells are not laid out as tables are. */
const tableOf = (
	children: Node[],
): Extract<MarkdownBlock, { type: "table" }> | null => {
	const parts = onlyElements(children, TABLE_PART_TAGS);
	if (!parts) return null;
	let caption: string | undefined;
	const rows: Array<{
		cells: Array<Extract<Node, { kind: "element" }>>;
		head: boolean;
	}> = [];
	const footer: typeof rows = [];
	for (const part of parts) {
		const { name } = part.tag;
		if (name === "caption") {
			caption ??= textOf(part.children);
			continue;
		}
		if (name === "colgroup") continue;
		const partRows =
			name === "tr" ? [part] : onlyElements(part.children, ROW_PART_TAGS);
		if (!partRows) return null;
		for (const row of partRows) {
			const cells = onlyElements(row.children, CELL_TAGS);
			if (!cells) return null;
			(name === "tfoot" ? footer : rows).push({
				cells,
				head: name === "thead",
			});
		}
	}
	rows.push(...footer);
	if (rows.length === 0) return null;
	const [first] = rows;
	const hasHeader =
		first.head ||
		(first.cells.length > 0 &&
			first.cells.every((cell) => cell.tag.name === "th"));
	const columns = Math.max(...rows.map((row) => row.cells.length));
	if (columns === 0) return null;
	const texts = rows.map((row) =>
		Array.from({ length: columns }, (_, column) => {
			const cell = row.cells[column];
			return cell ? textOf(cell.children) : "";
		}),
	);
	const align = Array.from({ length: columns }, (_, column) => {
		const cell = first.cells[column];
		return cell ? tagAlign(cell.tag.attributes) : null;
	});
	return {
		type: "table",
		align,
		header: hasHeader ? texts[0] : null,
		rows: hasHeader ? texts.slice(1) : texts,
		...(caption ? { caption } : {}),
	};
};

/**
 * What an HTML element shows, as blocks. An element out of place (an `<li>`
 * outside a list, a `<tr>` outside a table, a list or table whose children
 * are not its items or rows) is left out and its content shown instead.
 */
const elementBlocks = (
	element: Extract<Node, { kind: "element" }>,
	definitions: Definitions,
): MarkdownBlock[] => {
	const { name, attributes } = element.tag;
	const { children } = element;
	const unwrap = () => flowBlocks(children, definitions);
	const text = () => textOf(children);

	if (name === "hr") return [{ type: "rule" }];
	if (HEADING_TAGS.has(name)) {
		const content = text();
		return content
			? [{ type: "heading", level: Number(name[1]), text: content, html: true }]
			: [];
	}
	if (TEXT_BLOCK_TAGS.has(name)) {
		const content = text();
		if (!content) return [];
		const align = name === "p" ? tagAlign(attributes) : null;
		return [{ type: "paragraph", text: content, ...(align ? { align } : {}) }];
	}
	if (name === "ul" || name === "ol") {
		const items = onlyElements(children, LIST_TAGS);
		if (!items || items.length === 0) return unwrap();
		const start = Number.parseInt(attributes.start ?? "", 10);
		return [
			{
				type: "list",
				ordered: name === "ol",
				start: name === "ol" && Number.isFinite(start) ? start : 1,
				items: items.map((item) =>
					listItemOf(flowBlocks(item.children, definitions)),
				),
			},
		];
	}
	if (name === "dl") {
		const parts = onlyElements(children, DEFINITION_TAGS);
		// Terms first, and every term described.
		const valid =
			parts &&
			parts.length > 0 &&
			parts[0].tag.name === "dt" &&
			parts[parts.length - 1].tag.name === "dd";
		if (!valid) return unwrap();
		return [
			{
				type: "definitions",
				items: parts.map((part) =>
					part.tag.name === "dt"
						? { term: textOf(part.children) }
						: { blocks: flowBlocks(part.children, definitions) },
				),
			},
		];
	}
	if (name === "table") {
		const table = tableOf(children);
		return table ? [table] : unwrap();
	}
	if (name === "details") {
		const at = children.findIndex(
			(node) => node.kind === "element" && node.tag.name === "summary",
		);
		const summary =
			at >= 0 ? textOf((children[at] as { children: Node[] }).children) : "";
		return [
			{
				type: "details",
				summary: summary || null,
				blocks: flowBlocks(
					children.filter((_, index) => index !== at),
					definitions,
				),
			},
		];
	}
	const tag = SECTION_TAGS[name];
	if (tag) {
		const blocks =
			tag === "figure"
				? figureBlocks(children, definitions)
				: flowBlocks(children, definitions);
		const align = name === "center" ? "center" : tagAlign(attributes);
		return [{ type: "section", tag, align, blocks }];
	}
	// li, dd, and table parts out of place: their content.
	return unwrap();
};

/** A figure's content, its caption kept where HTML allows one: first or last. */
const figureBlocks = (children: Node[], definitions: Definitions) => {
	const isCaption = (node: Node | undefined) =>
		node?.kind === "element" && node.tag.name === "figcaption";
	const content = children.filter((node) => !isBlank(node));
	const first = isCaption(content[0]) ? content[0] : undefined;
	const last =
		!first && isCaption(content[content.length - 1])
			? content[content.length - 1]
			: undefined;
	const caption = (node: Node): MarkdownBlock[] => {
		const text = textOf((node as { children: Node[] }).children);
		return text ? [{ type: "caption", text }] : [];
	};
	const middle = content.filter((node) => node !== first && node !== last);
	return [
		...(first ? caption(first) : []),
		...flowBlocks(middle, definitions),
		...(last ? caption(last) : []),
	];
};

/**
 * Headings, paragraphs, lists (nested by indentation), quotes, fenced code,
 * GFM tables, and the HTML blocks import keeps, in order; plus the link and
 * footnote definitions, which are not shown where they are written. What the
 * site leaves out (`withoutUnsafeMarkup`: a script and what it holds, an
 * event handler, an unsafe link's address, an MDX expression) is left out
 * first, so the PDF, the EPUB, and the search index hold what the page
 * does.
 */
export const parseMarkdown = (markdown: string): MarkdownDocument => {
	const definitions: Definitions = { links: new Map(), notes: new Map() };
	const blocks = flowBlocks(
		blockTree(withoutUnsafeMarkup(markdown)),
		definitions,
	);
	return { blocks, ...definitions };
};
