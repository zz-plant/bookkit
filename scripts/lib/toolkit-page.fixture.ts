import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	buildExportParts,
	entryMarkdown,
} from "../../packages/astro-bookkit/src/exports/content-parsing";

/**
 * Reads a built book's toolkit pages against its PDF/EPUB export, so tests
 * can check the read page shows a procedure's sections in the export's order.
 */

const rawModules = (dir: string): Record<string, string> =>
	Object.fromEntries(
		readdirSync(dir)
			.filter((file) => /\.mdx?$/.test(file))
			.map((file) => [join(dir, file), readFileSync(join(dir, file), "utf8")]),
	);

/** Each toolkit action's `##` section headings in the export, by slug. */
export const exportedToolSections = (appDir: string): Map<string, string[]> => {
	const content = join(appDir, "src", "content", "book");
	const parts = buildExportParts({
		mechanisms: rawModules(join(content, "mechanisms")),
		toolkit: rawModules(join(content, "toolkit")),
	});
	const tools = parts
		.flatMap((part) => part.entries)
		.flatMap((entry) => [entry, ...(entry.children ?? [])])
		.filter((entry) => entry.kind === "tool");
	return new Map(
		tools.map((tool) => [
			tool.slug,
			[...entryMarkdown(tool).matchAll(/^## (.+)$/gm)].map((match) =>
				match[1].trim(),
			),
		]),
	);
};

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, "")
		.replace(/&#39;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.trim();

/** The page's content: from the title to the "Keep going" panel. */
export const toolPageContent = (html: string): string => {
	const start = html.indexOf("<h1");
	const end = html.indexOf('<section class="next-action-panel');
	if (start === -1 || end === -1) {
		throw new Error("Not a toolkit page: no <h1> or no next-action panel.");
	}
	return html.slice(start, end);
};

/** The `<h2>` headings in a toolkit page's content, in page order. */
export const toolPageSections = (html: string): string[] =>
	[...toolPageContent(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(
		(match) => text(match[1]),
	);

/** A description list's term/description pairs, in order. */
export const definitionPairs = (dl: string): Array<[string, string]> =>
	[...dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map(
		(match) => [text(match[1]), text(match[2])],
	);
