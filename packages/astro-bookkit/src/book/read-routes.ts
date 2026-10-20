export const readRoutes = {
	root: "/read",
	overview: "/read/overview",
	tools: "/read/tools",
	analytics: "/read/analytics",
	chapters: "/read/chapters",
	mechanisms: "/read/mechanisms",
	toolkit: "/read/toolkit",
	glossary: "/read/glossary",
	examples: "/read/examples",
} as const;

export type ReadIndexKey =
	| "chapters"
	| "mechanisms"
	| "toolkit"
	| "glossary"
	| "examples";

/**
 * Each read page's name where a page names its section: the header's
 * running head, the reading hub's section cards, the menu. `overview` is the
 * page built from book.config.ts (what the book sets out to do, its approach
 * and ground rules); it is "About this book" so it is not confused with a
 * chapter a book calls "Overview".
 */
export const readSectionTitles = {
	root: "Reading hub",
	overview: "About this book",
	chapters: "Chapters",
	mechanisms: "Mechanisms",
	toolkit: "Toolkit",
	glossary: "Glossary",
	examples: "Examples",
	tools: "Author tools",
	analytics: "Analytics",
} as const satisfies Record<keyof typeof readRoutes, string>;

/** The sections the menu lists, in the reading hub's order. */
export const MENU_READ_SECTIONS = [
	"root",
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
] as const satisfies ReadonlyArray<keyof typeof readRoutes>;

/**
 * The read section `path` is in (a path without its locale or version
 * prefix): the section whose route it is or is under, the hub for any other
 * read page, and null outside /read.
 */
export const readSectionOfPath = (
	path: string,
): keyof typeof readRoutes | null => {
	const normalized = path.replace(/\/+$/, "") || "/";
	const keys = Object.keys(readRoutes) as Array<keyof typeof readRoutes>;
	const section = keys.find(
		(key) =>
			key !== "root" &&
			(normalized === readRoutes[key] ||
				normalized.startsWith(`${readRoutes[key]}/`)),
	);
	if (section) return section;
	return normalized === readRoutes.root ||
		normalized.startsWith(`${readRoutes.root}/`)
		? "root"
		: null;
};

/**
 * `aria-current` for the menu's link to section `key`, on `path`: "page" on
 * the section's own page, "true" anywhere below it, so a screen reader says
 * which section the reader is in without calling a chapter the index. A read
 * page in no listed section (About this book, author tools) marks the hub.
 */
export const readSectionCurrent = (
	key: keyof typeof readRoutes,
	path: string,
	listed: ReadonlyArray<keyof typeof readRoutes> = MENU_READ_SECTIONS,
): "page" | "true" | undefined => {
	const section = readSectionOfPath(path);
	const marked = section && !listed.includes(section) ? "root" : section;
	if (marked !== key) return undefined;
	const normalized = path.replace(/\/+$/, "") || "/";
	return normalized === readRoutes[key] ? "page" : "true";
};

export const readSectionPath = (section: ReadIndexKey): string =>
	readRoutes[section];

export const readItemPath = (section: ReadIndexKey, slug: string): string =>
	`${readRoutes[section]}/${slug}`;

export const buildTranslationLede = (
	base: string,
	completeness: number | null,
): string => {
	if (typeof completeness !== "number" || completeness >= 1) {
		return base;
	}

	const percent = Math.round(completeness * 100);
	return `${base} ${percent}% translated so far.`;
};

export const formatTranslationCompleteness = (
	completeness: number | null,
): string | null => {
	if (typeof completeness !== "number" || completeness >= 1) {
		return null;
	}

	return `${Math.round(completeness * 100)}% translated`;
};
