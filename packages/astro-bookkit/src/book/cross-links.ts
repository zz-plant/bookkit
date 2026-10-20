import { toolkitDisplayName } from "../schemas/toolkit";
import { readItemPath } from "./read-routes";

/**
 * The links between a book's pages that its frontmatter already implies, in
 * both directions: a chapter lists the mechanisms it uses, so the mechanism
 * page lists the chapter; an action names its mechanism, so the chapters and
 * examples of that mechanism link to it, and it to them. Pages pass the
 * entries `resolveLocalizedContent` gives them, so links follow the reader's
 * locale and its fallbacks.
 */

/** A page entry as `resolveLocalizedContent` returns it. */
export type CrossLinkEntry<TFrontmatter> = {
	slug: string;
	module: { frontmatter?: TFrontmatter };
};

export type CrossLink = {
	/** The linked page's slug in its section. */
	slug: string;
	href: string;
	label: string;
	meta?: string;
};

type ChapterFrontmatter = {
	title?: string;
	order?: unknown;
	prerequisites?: unknown;
	mechanisms?: unknown;
};
type MechanismFrontmatter = { title?: string };
type ToolkitFrontmatter = {
	slug?: string;
	name?: string;
	title?: string;
	mechanism?: string;
	timeboxMinutes?: number;
};
type GlossaryFrontmatter = { term?: string; mechanisms?: unknown };
type ExampleFrontmatter = {
	title?: string;
	mechanism?: string;
	domain?: string;
};

const slugList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

/**
 * Chapters in the author's reading order: an explicit `order` first, else the
 * numbered file order the index keeps. Previous/next and every chapter list
 * use it.
 */
export const chapterReadingOrder = <
	TEntry extends CrossLinkEntry<ChapterFrontmatter>,
>(
	entries: readonly TEntry[],
): TEntry[] => {
	const orderOf = (entry: TEntry) => {
		const value = entry.module.frontmatter?.order;
		return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
	};
	return [...entries].sort((a, b) => {
		const difference = orderOf(a) - orderOf(b);
		return Number.isNaN(difference) ? 0 : difference;
	});
};

const chapterLink = (entry: CrossLinkEntry<ChapterFrontmatter>): CrossLink => ({
	slug: entry.slug,
	href: readItemPath("chapters", entry.slug),
	label: entry.module.frontmatter?.title ?? entry.slug,
});

/** Every chapter as a link, in reading order: what "Continue" and "Chapter N of M" count from. */
export const chapterLinksInReadingOrder = (
	entries: readonly CrossLinkEntry<ChapterFrontmatter>[],
): CrossLink[] => chapterReadingOrder(entries).map(chapterLink);

/** The chapters a chapter lists under `prerequisites`, in reading order. */
export const prerequisiteChapterLinks = (
	prerequisites: unknown,
	chapters: readonly CrossLinkEntry<ChapterFrontmatter>[],
): CrossLink[] => {
	const wanted = new Set(slugList(prerequisites));
	return chapterReadingOrder(chapters)
		.filter((entry) => wanted.has(entry.slug))
		.map(chapterLink);
};

/** The chapters that list `mechanism` under `mechanisms`, in reading order. */
export const chapterLinksForMechanism = (
	mechanism: string | undefined,
	chapters: readonly CrossLinkEntry<ChapterFrontmatter>[],
): CrossLink[] =>
	mechanism
		? chapterReadingOrder(chapters)
				.filter((entry) =>
					slugList(entry.module.frontmatter?.mechanisms).includes(mechanism),
				)
				.map(chapterLink)
		: [];

/**
 * The actions for any of `mechanisms`, grouped in the order the mechanisms
 * are given and shortest first within each, as the mechanism page lists them.
 */
export const actionLinksForMechanisms = (
	mechanisms: unknown,
	toolkit: readonly CrossLinkEntry<ToolkitFrontmatter>[],
): CrossLink[] =>
	slugList(mechanisms).flatMap((mechanism) =>
		toolkit
			.filter((entry) => entry.module.frontmatter?.mechanism === mechanism)
			.sort(
				(a, b) =>
					(a.module.frontmatter?.timeboxMinutes ?? 10) -
					(b.module.frontmatter?.timeboxMinutes ?? 10),
			)
			.map((entry) => ({
				slug: entry.slug,
				href: readItemPath("toolkit", entry.slug),
				label: toolkitDisplayName(entry.module.frontmatter ?? {}),
				meta: `${entry.module.frontmatter?.timeboxMinutes ?? 10} min`,
			})),
	);

/** The examples of `mechanism`, in index order. */
export const exampleLinksForMechanisms = (
	mechanisms: unknown,
	examples: readonly CrossLinkEntry<ExampleFrontmatter>[],
): CrossLink[] =>
	slugList(mechanisms).flatMap((mechanism) =>
		examples
			.filter((entry) => entry.module.frontmatter?.mechanism === mechanism)
			.map((entry) => ({
				slug: entry.slug,
				href: readItemPath("examples", entry.slug),
				label: entry.module.frontmatter?.title ?? entry.slug,
				meta: entry.module.frontmatter?.domain,
			})),
	);

/**
 * The mechanisms a glossary term names: its `mechanisms` list, else the
 * mechanism that shares its slug.
 */
export const mechanismLinksForTerm = (
	term: { slug: string; mechanisms?: unknown },
	mechanisms: readonly CrossLinkEntry<MechanismFrontmatter>[],
): CrossLink[] => {
	const declared = slugList(term.mechanisms);
	const wanted = declared.length > 0 ? declared : [term.slug];
	return wanted.flatMap((slug) => {
		const entry = mechanisms.find((mechanism) => mechanism.slug === slug);
		return entry
			? [
					{
						slug: entry.slug,
						href: readItemPath("mechanisms", entry.slug),
						label: entry.module.frontmatter?.title ?? entry.slug,
					},
				]
			: [];
	});
};

/** The glossary terms that name `mechanism` (see `mechanismLinksForTerm`). */
export const termLinksForMechanism = (
	mechanism: string,
	glossary: readonly CrossLinkEntry<GlossaryFrontmatter>[],
): CrossLink[] =>
	glossary
		.filter((entry) => {
			const declared = slugList(entry.module.frontmatter?.mechanisms);
			return declared.length > 0
				? declared.includes(mechanism)
				: entry.slug === mechanism;
		})
		.map((entry) => ({
			slug: entry.slug,
			href: readItemPath("glossary", entry.slug),
			label: entry.module.frontmatter?.term ?? entry.slug,
		}));

/** A mechanism's title by slug, for pages that name one; the slug when there is none. */
export const mechanismTitle = (
	slug: string | undefined,
	mechanisms: readonly CrossLinkEntry<MechanismFrontmatter>[],
): string =>
	mechanisms.find((entry) => entry.slug === slug)?.module.frontmatter?.title ??
	slug ??
	"";
