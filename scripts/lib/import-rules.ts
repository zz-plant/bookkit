import { posix } from "node:path";
import type { AttributeRefusal } from "../../packages/astro-bookkit/src/utils/html-allowlist";
import { SAFE_SCHEME_LIST } from "../../packages/astro-bookkit/src/utils/links";
import type {
	MdxConversion,
	UnsafeMarkupEntry,
} from "../../packages/astro-bookkit/src/utils/markdown";

/**
 * What `bookkit import` does to a folder of notes, shared with `bookkit try`
 * so its summary counts what import would do: which notes it skips, the
 * changes `toMdxBody` makes for a note to compile as MDX, and what it leaves
 * out (links it keeps as text, HTML the allowlist does not keep), in the
 * same words.
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

/**
 * What makes a note compile as MDX, as reports name it. An embed given a
 * title (`titles`) is not one: import reports it on its own line.
 */
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
		titles: 0,
	};
	const keys = Object.keys(total) as Array<keyof MdxConversion>;
	for (const change of changes) {
		for (const key of keys) total[key] += change[key];
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

/** Something import leaves out of a note, at a line of it. */
export type NoteMarkup = UnsafeMarkupEntry & { source: string };

const LISTED = 10;

const short = (value: string) =>
	value.length > 60 ? `${value.slice(0, 59)}…` : value;

/** Why an attribute goes, in a word or two. */
const REFUSALS: Record<AttributeRefusal, string> = {
	handler: "an event handler",
	style: "inline style",
	document: "a document in the page",
	"raw-html": "raw HTML",
	address: "an unsafe address",
	permission: "more than an embed needs",
	expression: "an expression",
	spread: "a spread",
	unlisted: "not one the element keeps",
};

/** Whether the link rule left it out (an address), rather than the HTML allowlist. */
const isAddress = (entry: UnsafeMarkupEntry): boolean =>
	entry.kind === "link" ||
	(entry.kind === "attribute" && entry.refusal === "address");

/** What a list says of one entry, after its note and line. */
const describeEntry = (entry: UnsafeMarkupEntry): string => {
	switch (entry.kind) {
		case "link":
			return JSON.stringify(short(entry.href));
		case "attribute": {
			if (entry.refusal === "address") {
				const address = JSON.stringify(short(entry.value));
				if (entry.element === "a" && entry.attribute === "href") return address;
				const tag = `<${entry.element} ${entry.attribute}> ${address}`;
				// An embed with no address shows nothing, so it goes too.
				return entry.element === "iframe" ? `${tag}, with the <iframe>` : tag;
			}
			const tag =
				entry.attribute === "{...}"
					? `<${entry.element} ${short(entry.value)}>`
					: `<${entry.element} ${entry.attribute}${entry.value ? `=${JSON.stringify(short(entry.value))}` : ""}>`;
			return `${tag}: ${REFUSALS[entry.refusal]}`;
		}
		case "element":
			return entry.element === "iframe"
				? "<iframe> with no src"
				: `<${entry.element}>, ${entry.keeps === "nothing" ? "with what it holds" : "keeping what it holds"}`;
		case "expression":
			return `${short(entry.source)}: an expression`;
		case "code":
			return `${short(entry.source.split("\n")[0])}: code`;
	}
};

/** A list under `lead`, each entry with its note and line; nothing when there are none. */
const listed = (lead: string, entries: readonly NoteMarkup[]): string[] => {
	if (entries.length === 0) return [];
	return [
		`${lead} (${entries.length}):`,
		...entries
			.slice(0, LISTED)
			.map(
				(entry) => `  ${entry.source}:${entry.line}  ${describeEntry(entry)}`,
			),
		...(entries.length > LISTED
			? [`  … and ${entries.length - LISTED} more`]
			: []),
	];
};

/**
 * What import leaves out, each with its note and line, in two lists: the
 * addresses it removes (`leads.links`, "Addresses removed"), where a link
 * keeps its words and an element's address names the element and attribute
 * (`<iframe src> "javascript:…"`); and the HTML it leaves out (`leads.html`,
 * "HTML left out"). Nothing when there is nothing.
 */
export const describeUnsafeMarkup = (
	leads: { links: string; html: string },
	entries: readonly NoteMarkup[],
): string[] => {
	const links = listed(
		`${leads.links} (a link keeps its words), since a book links only to ${SAFE_SCHEME_LIST} addresses and to its own pages`,
		entries.filter(isAddress),
	);
	const html = listed(
		`${leads.html}, since a book's content may lay out text, link, show images, and embed pages, but not run script or set its own style`,
		entries.filter((entry) => !isAddress(entry)),
	);
	return [...links, ...(links.length && html.length ? [""] : []), ...html];
};
