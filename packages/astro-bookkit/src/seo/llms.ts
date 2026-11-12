import { extractPageFacts } from "../markdown/pageFacts";
import { parseFrontmatter } from "../utils/frontmatter";
import { type BookSeoConfig, resolveSiteUrl } from "./config";
import { isThinPage } from "./page-meta";
import { buildAbsoluteUrl } from "./urls";

/**
 * The book for language models: `/llms.txt`, an index in the llmstxt.org
 * form, and a Markdown copy of each entry
 * (`/md/<section>/<slug>.md`). A model reads the copy instead of the HTML,
 * so it quotes the book's own words and frontmatter: a mechanism's
 * definition, its `is`, `isNot`, and tests. Both follow the site's rule for
 * crawlers: a book that is not indexable (a draft, or `site.indexable:
 * false`) lists nothing, and stubs are left out as they are from search.
 */

export const LLMS_SECTIONS = [
	{ key: "chapters", heading: "Chapters" },
	{ key: "mechanisms", heading: "Mechanisms" },
	{ key: "toolkit", heading: "Tools" },
	{ key: "glossary", heading: "Glossary" },
	{ key: "examples", heading: "Examples" },
] as const;

export type LlmsSection = (typeof LLMS_SECTIONS)[number]["key"];

export type LlmsEntry = {
	section: LlmsSection;
	slug: string;
	title: string;
	/** One line: the summary, definition, or opening sentence. */
	note: string;
	/** The entry's source, as `markdownCopy` serves it. */
	markdown: string;
};

const text = (value: unknown): string =>
	typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/**
 * The source as Markdown: MDX comments and import or export lines removed,
 * the frontmatter kept, since it is where a mechanism's contract is.
 */
export const markdownCopy = (source: string): string =>
	`${source
		.replace(/\{\/\*[\s\S]*?\*\/\}\s*/g, "")
		.replace(/^(?:import|export)\s.*$\n?/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim()}\n`;

/**
 * Each section's entries in the default locale, in file order: a file under
 * a locale folder (`chapters/fr/…`) is a translation of one listed already.
 */
export const llmsEntries = (
	modules: Partial<Record<LlmsSection, Record<string, string>>>,
	site?: BookSeoConfig,
): LlmsEntry[] =>
	LLMS_SECTIONS.flatMap(({ key }) =>
		Object.entries(modules[key] ?? {})
			.filter(([path]) => {
				const marker = `/${key}/`;
				const rest = path.slice(path.lastIndexOf(marker) + marker.length);
				return !rest.includes("/");
			})
			.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
			.flatMap(([path, source]): LlmsEntry[] => {
				const parsed = parseFrontmatter(source);
				const data = parsed.status === "ok" ? parsed.data : {};
				const stem =
					path
						.split("/")
						.pop()
						?.replace(/\.mdx?$/, "") ?? path;
				const facts = extractPageFacts(source);
				if (key === "chapters" && isThinPage(facts.wordCount, site)) return [];
				return [
					{
						section: key,
						slug: text(data.slug) || stem,
						title:
							text(data.title) || text(data.name) || text(data.term) || stem,
						note:
							text(data.summary) ||
							text(data.definition) ||
							text(facts.excerpt).split(/(?<=[.!?])\s/)[0] ||
							"",
						markdown: markdownCopy(source),
					},
				];
			}),
	);

/** Where an entry's Markdown copy is served, from the site's root. */
export const markdownCopyPath = (entry: Pick<LlmsEntry, "section" | "slug">) =>
	`/md/${entry.section}/${entry.slug}.md`;

export const createLlmsTxt = (book: {
	title: string;
	description?: string;
	site?: BookSeoConfig;
	entries: readonly LlmsEntry[];
}): string => {
	const description = text(book.description);
	const head = `# ${book.title}\n${description ? `\n> ${description}\n` : ""}`;
	if (book.site?.indexable === false) {
		return `${head}\nThis book is not open to automated readers: it is a draft, or its site.indexable is false (as it is outside a production build in most books).\n`;
	}
	const siteUrl = resolveSiteUrl(book.site);
	const url = (path: string) =>
		siteUrl ? buildAbsoluteUrl(siteUrl, path) : path;
	const sections = LLMS_SECTIONS.flatMap(({ key, heading }) => {
		const listed = book.entries.filter((entry) => entry.section === key);
		return listed.length > 0
			? [
					`## ${heading}\n\n${listed
						.map(
							(entry) =>
								`- [${entry.title}](${url(markdownCopyPath(entry))})${entry.note ? `: ${entry.note}` : ""}`,
						)
						.join("\n")}`,
				]
			: [];
	});
	return `${head}
Each link is the entry's Markdown source, frontmatter included: a mechanism's definition, what it is and is not, and its tests are fields there. Use a mechanism as it is defined; the book treats a redefinition as a different idea.

${sections.join("\n\n")}

## Optional

- [MCP manifest](${url("/api/mcp.json")}): the book's resources and tools for an MCP client. On a static site it is the manifest only; nothing answers tool calls.
`;
};
