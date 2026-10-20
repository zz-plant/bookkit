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
	/**
	 * Every word the reader sees for this result, which search matches against:
	 * the whole section, and for a page the fields its template shows (an
	 * action's trigger and steps, a mechanism's definition). The snippet is
	 * only the preview.
	 */
	text?: string;
};

const parseFrontmatter = (raw: string) => {
	const parsed = parseSharedFrontmatter(raw);
	return {
		data: frontmatterTextFields(parsed.data),
		fields: parsed.data as Record<string, unknown>,
		body: parsed.body,
	};
};

/**
 * The frontmatter fields each section's page shows, in page order. Search
 * finds a page by these words as well as by its body. `mechanism` stands for
 * the mechanism's title, which toolkit and example pages show.
 */
const DISPLAYED_FIELDS: Record<string, readonly string[]> = {
	chapters: ["summary"],
	mechanisms: ["definition", "is", "isNot", "predictions", "tests"],
	toolkit: [
		"mechanism",
		"owner",
		"trigger",
		"steps",
		"runbookSteps",
		"escalation",
		"drills",
		"failureLooksLike",
		"legitimateDemand",
	],
	glossary: ["definition"],
	examples: ["mechanism", "domain", "summary"],
};

/** The text a field shows: strings, lists, and the string values of objects (a runbook step's `when` and `action`). */
const fieldText = (value: unknown): string[] => {
	if (typeof value === "string") return [value];
	if (typeof value === "number") return [String(value)];
	if (Array.isArray(value)) return value.flatMap(fieldText);
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(fieldText);
	}
	return [];
};

const joinText = (texts: string[]) =>
	texts.join(" ").replace(/\s+/g, " ").trim();

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
 * `-1` suffixes as it does on the page. `all` is the text without those
 * headings and `intro` the text before the first, so a preview never opens
 * with a section's title.
 */
const readBody = (body: string) => {
	const { document, ids } = parseEntryMarkdown({ body });
	const all: string[] = [];
	const intro: string[] = [];
	const sections: Section[] = [];
	let current: Section | null = null;
	const add = (text: string) => {
		const plain = stripMarkdown(text);
		if (!plain) return;
		all.push(plain);
		(current?.text ?? intro).push(plain);
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
	return { all, intro, sections };
};

const extractSnippet = (texts: string[]) =>
	summarize(joinText(texts) || "No summary available.");

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

const slugFor = (
	source: SearchContentSource,
	path: string,
	data: Record<string, string>,
) =>
	data.slug ||
	(source.slugFromPath
		? source.slugFromPath(path)
		: defaultSlugFromPath(path, source.type));

/** Mechanism titles by slug, for the pages that name their mechanism. */
const mechanismTitles = (sources: SearchContentSource[]) => {
	const titles = new Map<string, string>();
	for (const source of sources.filter((s) => s.type === "mechanisms")) {
		for (const [path, raw] of Object.entries(source.modules)) {
			const { data } = parseFrontmatter(raw);
			const slug = slugFor(source, path, data);
			if (slug) titles.set(slug, data[source.titleKey] || data.title || slug);
		}
	}
	return titles;
};

export const buildSearchEntries = async (
	sources: SearchContentSource[],
): Promise<SearchEntry[]> => {
	const entries: SearchEntry[] = [];
	const titlesOfMechanisms = mechanismTitles(sources);

	for (const source of sources) {
		for (const [path, raw] of Object.entries(source.modules)) {
			const { data, fields, body } = parseFrontmatter(raw);
			const slug = slugFor(source, path, data);
			if (!slug) continue;
			const title = data[source.titleKey] || data.title || slug;
			const shown = (DISPLAYED_FIELDS[source.type] ?? []).flatMap((field) =>
				field === "mechanism" && typeof fields.mechanism === "string"
					? [titlesOfMechanisms.get(fields.mechanism) ?? fields.mechanism]
					: fieldText(fields[field]),
			);
			// Anchors are the ids the site gives the headings, or deep links
			// land at the top of the page.
			const { all, intro, sections } = readBody(body);
			const sectionEntries = sections.map((section) => ({
				heading: section.heading || title,
				anchor: section.anchor,
				snippet: extractSnippet(section.text),
				text: joinText(section.text),
			}));

			// The page's own result opens the page at its title, and previews
			// the line its page leads with (summary, definition, or trigger)
			// before the start of its body.
			const introText = joinText(intro);
			const lead = [data.summary, data.definition, data.trigger].find(Boolean);
			entries.push({
				id: `${source.type}-${slug}-intro`,
				type: source.type,
				label: source.label,
				order: source.order,
				title,
				section: null,
				snippet: lead
					? summarize(lead)
					: extractSnippet(introText ? intro : all),
				url: `${source.urlPrefix}${slug}`,
				context: title,
				text: [...shown, introText].filter(Boolean).join(" "),
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
					text: section.text,
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
