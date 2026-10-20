import { posix } from "node:path";
import type { MdxConversion } from "../../packages/astro-bookkit/src/utils/markdown";

/**
 * What `bookkit import` does to a folder of notes, shared with `bookkit try`
 * so its summary counts what import would do: which notes it skips, and the
 * changes `toMdxBody` makes for a note to compile as MDX, in the same words.
 */

/** A folder's own page: skipped unless `--include-readme`. */
export const INDEX_NAMES = new Set(["readme", "index", "_index"]);
/** Navigation for a docs site, not prose: always skipped. */
const NAVIGATION_NAMES = new Set(["summary", "_sidebar", "_navbar", "_footer"]);

/** Why import leaves a note out, or null when it imports it. */
export const importSkipReason = (
	source: string,
	includeReadme = false,
): string | null => {
	const name = posix
		.basename(source)
		.replace(/\.(md|mdx|markdown)$/i, "")
		.toLowerCase();
	if (NAVIGATION_NAMES.has(name)) return "site navigation, not a chapter";
	if (INDEX_NAMES.has(name) && !includeReadme)
		return "folder index; --include-readme imports it as a chapter";
	return null;
};

const LABELS: ReadonlyArray<
	readonly [key: keyof MdxConversion, one: string, many: string]
> = [
	["html", "HTML tag kept as HTML", "HTML tags kept as HTML"],
	[
		"htmlComments",
		"HTML comment made an MDX comment",
		"HTML comments made MDX comments",
	],
	["autolinks", "<autolink> made a link", "<autolinks> made links"],
	["braces", "brace escaped", "braces escaped"],
	["tags", "tag-like < escaped", "tag-like < escaped"],
	["esm", "import/export line escaped", "import/export lines escaped"],
];

export const sumConversions = (
	changes: readonly MdxConversion[],
): MdxConversion => {
	const total: MdxConversion = {
		htmlComments: 0,
		braces: 0,
		autolinks: 0,
		tags: 0,
		html: 0,
		esm: 0,
	};
	for (const change of changes) {
		for (const [key] of LABELS) total[key] += change[key];
	}
	return total;
};

export const countConversions = (changes: MdxConversion): number =>
	LABELS.reduce((sum, [key]) => sum + changes[key], 0);

/** "2 braces escaped, 1 import/export line escaped", or "" when nothing changes. */
export const describeConversions = (changes: MdxConversion): string =>
	LABELS.filter(([key]) => changes[key] > 0)
		.map(
			([key, one, many]) =>
				`${changes[key]} ${changes[key] === 1 ? one : many}`,
		)
		.join(", ");
