import { parseFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";
import {
	type MdxConversion,
	toMdxBody,
} from "../../packages/astro-bookkit/src/utils/markdown";

/**
 * One Markdown file as `bookkit import` turns it into a chapter. Exports from
 * wikis, blogs, and note apps carry their own frontmatter, a leading `# Title`,
 * and text MDX cannot compile; the chapter keeps the title and summary, drops
 * what would repeat, and escapes the rest so the book builds.
 */
export type ImportedChapter = {
	title: string;
	summary?: string;
	/** The full chapter file, frontmatter included. */
	source: string;
	changes: MdxConversion;
	/** The source's frontmatter did not parse; it was kept as text. */
	unreadableFrontmatter?: string;
};

export const titleFromFileName = (name: string): string => {
	const base = (name.split(/[\\/]/).pop() ?? name)
		.replace(/\.(md|mdx)$/i, "")
		.replace(/^\d+[\s_-]*/i, "")
		.replace(/[-_]+/g, " ")
		.trim();
	return base.charAt(0).toUpperCase() + base.slice(1);
};

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

export const importChapter = (
	file: string,
	raw: string,
	slug: string,
): ImportedChapter => {
	const parsed = parseFrontmatter(raw);
	const data = parsed.status === "ok" ? parsed.data : {};
	// An unparseable block stays in the body, so nothing is lost silently.
	let body = (parsed.status === "invalid" ? raw : parsed.body).trim();

	// A leading "# Title" is the page title; the chapter page shows it already.
	const heading = body.match(/^#\s+(.+?)\s*#*\s*(?:\n|$)/);
	if (heading) body = body.slice(heading[0].length).trim();

	const title =
		text(data.title) ?? heading?.[1]?.trim() ?? titleFromFileName(file);
	const summary =
		text(data.summary) ?? text(data.description) ?? text(data.subtitle);
	const { body: mdx, changes } = toMdxBody(body);

	// JSON strings are valid YAML, so quotes and colons in a title stay safe.
	const frontmatter = [
		"---",
		`slug: ${slug}`,
		"status: draft",
		`title: ${JSON.stringify(title)}`,
		...(summary ? [`summary: ${JSON.stringify(summary)}`] : []),
		"---",
	];
	return {
		title,
		summary,
		source: `${[...frontmatter, "", mdx].join("\n")}\n`,
		changes,
		unreadableFrontmatter:
			parsed.status === "invalid" ? parsed.reason : undefined,
	};
};
