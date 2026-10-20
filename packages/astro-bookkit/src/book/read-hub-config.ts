import type { BookReadHubConfig } from "./config";
import type { ReadHubConfig, ReadHubQuickStartCard } from "./read-hub";
import { readRoutes, readSectionTitles } from "./read-routes";

/** The chapter a reader starts with: the first in reading order. */
export type ReadHubFirstChapter = {
	title: string;
	href: string;
	/** The chapter's `summary`, if it has one. */
	summary?: string;
};

/** The "Where to start" card that opens chapter 1. */
export const firstChapterCard = (
	chapter: ReadHubFirstChapter,
): ReadHubQuickStartCard => ({
	title: `Start with chapter 1: ${chapter.title}`,
	description: chapter.summary || "The book from its first page.",
	href: chapter.href,
	funnelStep: "new_reader_first_chapter",
});

/**
 * The default "Where to start" cards: what the book is, its chapters, and
 * chapter 1 itself when the book has one.
 */
const defaultQuickStartCards = (
	firstChapter?: ReadHubFirstChapter,
): ReadHubQuickStartCard[] => [
	{
		title: readSectionTitles.overview,
		description:
			"What the book sets out to do, its approach, and its ground rules.",
		href: readRoutes.overview,
		recommended: true,
		funnelStep: "new_reader_overview",
	},
	{
		title: "Read the chapters in order",
		description: "The full argument, start to finish.",
		href: readRoutes.chapters,
		funnelStep: "new_reader_chapters",
	},
	...(firstChapter ? [firstChapterCard(firstChapter)] : []),
];

/**
 * The reading hub of a book that sets no `readHub` in book.config.ts, before
 * its first chapter is known (`resolveReadHubConfig` adds that card).
 */
export const defaultReadHubConfig: ReadHubConfig = {
	hero: {
		title: readSectionTitles.root,
		lede: "See what the book sets out to do, start at chapter 1, or look something up.",
		quickLinks: [],
		quickStartAriaLabel: "Where to start",
	},
	quickStartCards: defaultQuickStartCards(),
	intro: {
		title: "All sections",
	},
	bucketNavigation: "stacked",
	buckets: [
		{
			id: "start-here",
			title: "Start here",
			description: "Read these first.",
			sectionKeys: ["overview", "chapters"],
			primary: true,
		},
		{
			id: "solve-now",
			title: "Solve a problem",
			description: "Name the pattern, then pick an action.",
			sectionKeys: ["mechanisms", "toolkit"],
		},
		{
			id: "reference",
			title: "Look something up",
			description: "Terms and worked cases.",
			sectionKeys: ["glossary", "examples"],
		},
	],
	utilities: {
		mode: "accordion",
		title: "Release notes, downloads, and author tools",
		cards: [
			{
				title: "Updates",
				description: "See what changed, or download a copy to read offline.",
				links: [
					{ label: "Release notes", href: "/release-notes" },
					{ label: "Downloads", href: "/downloads" },
				],
			},
			{
				title: "For authors",
				description: "Analytics and publishing tools.",
				links: [{ label: "Author tools", href: readRoutes.tools }],
			},
		],
	},
	releaseFilter: {
		initialLabel: "Show recently updated",
		activeLabel: "Show all sections",
	},
};

/**
 * The reading hub with `readHub` from book.config.ts over the default. A
 * book that lists no cards of its own gets the default ones, the last of
 * which opens `firstChapter`.
 */
export const resolveReadHubConfig = (
	readHub?: BookReadHubConfig,
	{ firstChapter }: { firstChapter?: ReadHubFirstChapter } = {},
): ReadHubConfig => ({
	...defaultReadHubConfig,
	hero: {
		...defaultReadHubConfig.hero,
		lede: readHub?.lede ?? defaultReadHubConfig.hero.lede,
	},
	quickStartCards: [
		...(readHub?.quickStartCards ?? defaultQuickStartCards(firstChapter)),
	],
});
