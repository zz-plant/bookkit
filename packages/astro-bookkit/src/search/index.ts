import type { MarkdownBlock } from "../exports/markdown-blocks";
import { childBlocks, parseEntryMarkdown } from "../exports/markdown-headings";
import {
	frontmatterTextFields,
	parseFrontmatter as parseSharedFrontmatter,
} from "../utils/frontmatter";
import { stripMarkdown } from "../utils/markdown";

export type SearchContentSource = {
	type: string;
	label: string;
	order: number;
	urlPrefix: string;
	titleKey: string;
	modules: Record<string, string>;
	slugFromPath?: (path: string) => string | null;
};

export type SearchEntry = {
	id: string;
	type: string;
	label: string;
	order: number;
	title: string;
	section?: string | null;
	snippet: string;
	url: string;
	context: string;
};

const parseFrontmatter = (raw: string) => {
	const parsed = parseSharedFrontmatter(raw);
	return { data: frontmatterTextFields(parsed.data), body: parsed.body };
};

const summarize = (value: string, maxLength = 160) => {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1).trim()}…`;
};

type Section = { heading: string; anchor: string; text: string[] };

/**
 * A body's text, and its `##` and `###` headings with the text under each,
 * read with the parse the PDF and EPUB use: code blocks and MDX comments
 * are not text, and a `##` line inside code is not a heading. Each heading's
 * anchor is the id the site gives it (`headingIds`), counted over headings
 * of every level, so a `####` or `#` heading with the same text shifts the
 * `-1` suffixes as it does on the page.
 */
const readBody = (body: string) => {
	const { document, ids } = parseEntryMarkdown({ body });
	const all: string[] = [];
	const sections: Section[] = [];
	let current: Section | null = null;
	const add = (text: string) => {
		const plain = stripMarkdown(text);
		if (!plain) return;
		all.push(plain);
		current?.text.push(plain);
	};
	const read = (blocks: MarkdownBlock[]) => {
		for (const block of blocks) {
			const anchor = block.type === "heading" ? ids.get(block) : undefined;
			if (
				block.type === "heading" &&
				anchor &&
				(block.level === 2 || block.level === 3)
			) {
				const heading = stripMarkdown(block.text).trim();
				all.push(heading);
				current = { heading, anchor, text: [] };
				sections.push(current);
				continue;
			}
			switch (block.type) {
				case "heading":
				case "paragraph":
				case "quote":
				case "caption":
					add(block.text);
					break;
				case "list":
					for (const item of block.items) {
						add(item.text);
						read(item.blocks);
					}
					break;
				case "table":
					for (const cell of [
						...(block.caption ? [block.caption] : []),
						...(block.header ?? []),
						...block.rows.flat(),
					]) {
						add(cell);
					}
					break;
				case "details":
					if (block.summary) add(block.summary);
					read(block.blocks);
					break;
				case "definitions":
					for (const item of block.items) {
						if ("term" in item) add(item.term);
						else read(item.blocks);
					}
					break;
				default:
					read(childBlocks(block));
			}
		}
	};
	read(document.blocks);
	return { all, sections };
};

const extractSnippet = (texts: string[]) =>
	summarize(
		texts.join(" ").replace(/\s+/g, " ").trim() || "No summary available.",
	);

// Routes key every section, examples included, by file name; nested example
// folders only group files by mechanism.
const defaultSlugFromPath = (path: string, _type: string) => {
	return (
		path
			.split("/")
			.pop()
			?.replace(/\.mdx?$/, "") ?? null
	);
};

export const buildSearchEntries = async (
	sources: SearchContentSource[],
): Promise<SearchEntry[]> => {
	const entries: SearchEntry[] = [];

	for (const source of sources) {
		for (const [path, raw] of Object.entries(source.modules)) {
			const { data, body } = parseFrontmatter(raw);
			const slug =
				data.slug ||
				(source.slugFromPath
					? source.slugFromPath(path)
					: defaultSlugFromPath(path, source.type));
			if (!slug) continue;
			const title = data[source.titleKey] || data.title || slug;
			// Anchors are the ids the site gives the headings, or deep links
			// land at the top of the page.
			const { all, sections } = readBody(body);
			const sectionEntries = sections.map((section) => ({
				heading: section.heading || title,
				anchor: section.anchor,
				snippet: extractSnippet(section.text),
			}));

			const baseSnippet = extractSnippet(all);
			const defaultAnchor = sectionEntries.length
				? sectionEntries[0].anchor
				: null;
			entries.push({
				id: `${source.type}-${slug}-intro`,
				type: source.type,
				label: source.label,
				order: source.order,
				title,
				section: null,
				snippet: baseSnippet,
				url: `${source.urlPrefix}${slug}${defaultAnchor ? `#${defaultAnchor}` : ""}`,
				context: title,
			});

			sectionEntries.forEach((section) => {
				entries.push({
					id: `${source.type}-${slug}-${section.anchor}`,
					type: source.type,
					label: source.label,
					order: source.order,
					title: section.heading,
					section: section.heading,
					snippet: section.snippet,
					url: `${source.urlPrefix}${slug}#${section.anchor}`,
					context: title,
				});
			});
		}
	}

	return entries;
};

export const createSearchIndexResponse = async (
	sources: SearchContentSource[],
) => {
	const entries = await buildSearchEntries(sources);
	return new Response(JSON.stringify({ entries }), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
};
