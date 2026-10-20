import { posix } from "node:path";
import { SAFE_SCHEME_LIST } from "../../packages/astro-bookkit/src/utils/links";
import type {
	MdxConversion,
	UnsafeLink,
} from "../../packages/astro-bookkit/src/utils/markdown";

/**
 * What `bookkit import` does to a folder of notes, shared with `bookkit try`
 * so its summary counts what import would do: which notes it skips, the
 * changes `toMdxBody` makes for a note to compile as MDX, and the links it
 * keeps as text, in the same words.
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

/** A link import keeps as its text, at a line of its note. */
export type NoteUnsafeLink = Pick<
	UnsafeLink,
	"line" | "href" | "element" | "attribute"
>;

const LISTED_UNSAFE_LINKS = 10;

/**
 * The links import keeps as their text, each with its note and line, under
 * `lead` ("Links kept as text"); nothing when there are none. An element's
 * address names the element and attribute: `<iframe src> "javascript:…"`.
 */
export const describeUnsafeLinks = (
	lead: string,
	links: ReadonlyArray<NoteUnsafeLink & { source: string }>,
): string[] => {
	if (links.length === 0) return [];
	const lines = [
		`${lead}, since a book links only to ${SAFE_SCHEME_LIST} addresses and to its own pages (${links.length}):`,
	];
	for (const link of links.slice(0, LISTED_UNSAFE_LINKS)) {
		const href =
			link.href.length > 60 ? `${link.href.slice(0, 59)}…` : link.href;
		const where =
			link.element && link.attribute && link.attribute !== "href"
				? `<${link.element} ${link.attribute}> `
				: "";
		lines.push(
			`  ${link.source}:${link.line}  ${where}${JSON.stringify(href)}`,
		);
	}
	if (links.length > LISTED_UNSAFE_LINKS) {
		lines.push(`  … and ${links.length - LISTED_UNSAFE_LINKS} more`);
	}
	return lines;
};
