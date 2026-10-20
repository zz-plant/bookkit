import GithubSlugger from "github-slugger";
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

/** Plain text of Markdown lines, without headings or MDX import/export lines. */
const plainText = (lines: string[]) =>
	lines
		.filter((line) => !/^\s*(#{1,6}\s|import\s|export\s)/.test(line))
		.map((line) => stripMarkdown(line))
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

const summarize = (value: string, maxLength = 160) => {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1).trim()}…`;
};

const buildSections = (body: string) => {
	const lines = body.split("\n");
	const sections: Array<{ heading: string; body: string[] }> = [];
	let current: { heading: string; body: string[] } | null = null;

	for (const line of lines) {
		const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);
		if (headingMatch) {
			if (current) sections.push(current);
			const headingText = stripMarkdown(
				headingMatch[2].replace(/#+\s*$/, ""),
			).trim();
			current = { heading: headingText, body: [] };
			continue;
		}
		if (current) current.body.push(line);
	}
	if (current) sections.push(current);
	return sections;
};

const extractSnippet = (lines: string[]) =>
	summarize(plainText(lines) || "No summary available.");

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
			// Astro's Markdown processor gives headings GitHub-style ids; the
			// anchors must match them or deep links land at the top of the page.
			const slugger = new GithubSlugger();
			const sections = buildSections(body);
			const sectionEntries = sections.map((section) => {
				const heading = section.heading || title;
				const anchor = slugger.slug(heading);
				const snippet = extractSnippet(section.body);
				return { heading, anchor, snippet, text: plainText(section.body) };
			});

			// The page's own result opens the page at its title, and previews
			// the line its page leads with (summary, definition, or trigger)
			// before the start of its body.
			const lines = body.split("\n");
			const firstHeading = lines.findIndex((line) => /^#{2,3}\s/.test(line));
			const intro = plainText(
				firstHeading === -1 ? lines : lines.slice(0, firstHeading),
			);
			const lead = [data.summary, data.definition, data.trigger].find(Boolean);
			entries.push({
				id: `${source.type}-${slug}-intro`,
				type: source.type,
				label: source.label,
				order: source.order,
				title,
				section: null,
				snippet: summarize(
					lead || intro || plainText(lines) || "No summary available.",
				),
				url: `${source.urlPrefix}${slug}`,
				context: title,
				text: [...shown, intro].filter(Boolean).join(" "),
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
