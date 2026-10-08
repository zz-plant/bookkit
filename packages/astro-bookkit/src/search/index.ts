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
};

const parseFrontmatter = (raw: string) => {
	const parsed = parseSharedFrontmatter(raw);
	return { data: frontmatterTextFields(parsed.data), body: parsed.body };
};

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

const extractSnippet = (lines: string[]) => {
	const text = lines
		.map((line) => stripMarkdown(line))
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	return summarize(text || "No summary available.");
};

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
			// Astro's Markdown processor gives headings GitHub-style ids; the
			// anchors must match them or deep links land at the top of the page.
			const slugger = new GithubSlugger();
			const sections = buildSections(body);
			const sectionEntries = sections.map((section) => {
				const heading = section.heading || title;
				const anchor = slugger.slug(heading);
				const snippet = extractSnippet(section.body);
				return { heading, anchor, snippet };
			});

			const baseSnippet = extractSnippet(body.split("\n").slice(0, 6));
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
