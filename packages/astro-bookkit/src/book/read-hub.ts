import {
	buildLocalizedContentIndex,
	resolveLocalizedContent,
} from "../localization/content";
import type { ReleaseSectionSlug } from "../releases/notes";
import { readRoutes, readSectionTitles } from "./read-routes";

export type ReadHubSectionKey = ReleaseSectionSlug | "overview";

export type ReadHubHeroLink = {
	label: string;
	href: string;
	primary?: boolean;
	funnelStep?: string;
};

export type ReadHubHeroConfig = {
	eyebrow?: string;
	title: string;
	lede: string;
	quickLinks: ReadHubHeroLink[];
	quickLinksAriaLabel?: string;
	quickStartAriaLabel?: string;
};

export type ReadHubQuickStartCard = {
	eyebrow?: string;
	title: string;
	description: string;
	href: string;
	recommended?: boolean;
	funnelStep?: string;
};

export type ReadHubIntroConfig = {
	eyebrow?: string;
	title: string;
	lede?: string;
};

export type ReadHubBucket = {
	id: string;
	title: string;
	description: string;
	sectionKeys: ReadHubSectionKey[];
	primary?: boolean;
};

export type ReadHubUtilityLink = {
	label: string;
	href: string;
	primary?: boolean;
	funnelStep?: string;
};

export type ReadHubUtilityCard = {
	eyebrow?: string;
	title: string;
	description: string;
	links: ReadHubUtilityLink[];
	featured?: boolean;
	deemphasizeUntilStarted?: boolean;
	secondaryNote?: string;
};

export type ReadHubUtilitiesConfig = {
	mode: "default" | "accordion";
	eyebrow?: string;
	title: string;
	lede?: string;
	cards: ReadHubUtilityCard[];
	id?: string;
};

export type ReadHubReleaseFilterLabels = {
	initialLabel: string;
	activeLabel: string;
};

export type ReadHubLatestChange = {
	version: string;
	date: string;
};

export type ReadHubSection = {
	sectionKey: ReadHubSectionKey;
	title: string;
	description: string;
	href: string;
	count: number;
	completeness?: number | null;
	latestChange?: ReadHubLatestChange;
};

export type ReadHubConfig = {
	hero: ReadHubHeroConfig;
	intro: ReadHubIntroConfig;
	buckets: ReadHubBucket[];
	quickStartCards?: ReadHubQuickStartCard[];
	utilities?: ReadHubUtilitiesConfig;
	bucketNavigation?: "stacked" | "tabs";
	releaseFilter?: ReadHubReleaseFilterLabels;
};

export type ReadHubSectionStats = {
	count: number;
	completeness?: number | null;
};

export type ReadHubSectionStatsMap = {
	chapters: ReadHubSectionStats;
	mechanisms: ReadHubSectionStats;
	toolkit: ReadHubSectionStats;
	glossary: ReadHubSectionStats;
	examples: ReadHubSectionStats;
};

export type ReadHubContentSectionKey = keyof ReadHubSectionStatsMap;

type LocalizedContentFrontmatter = {
	slug?: string;
	locale?: string;
};

export type ReadHubContentModule = {
	frontmatter?: LocalizedContentFrontmatter;
};

export type ReadHubContentModuleGroups<
	TModule extends ReadHubContentModule = ReadHubContentModule,
> = {
	[K in ReadHubContentSectionKey]: Record<string, TModule>;
};

export type ReadHubLocalizedSectionEntry<
	TModule extends ReadHubContentModule = ReadHubContentModule,
> = {
	slug: string;
	module: TModule;
	locale: string;
	isFallback: boolean;
};

export type ReadHubSectionSummary<
	TModule extends ReadHubContentModule = ReadHubContentModule,
> = {
	count: number;
	completeness: number | null;
	entries: ReadHubLocalizedSectionEntry<TModule>[];
};

export type ReadHubSectionSummaryMap<
	TGroups extends ReadHubContentModuleGroups = ReadHubContentModuleGroups,
> = {
	[K in keyof TGroups]: ReadHubSectionSummary<
		TGroups[K] extends Record<string, infer TModule>
			? TModule extends ReadHubContentModule
				? TModule
				: ReadHubContentModule
			: ReadHubContentModule
	>;
};

const READ_HUB_CONTENT_SECTION_KEYS = [
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
] as const satisfies ReadHubContentSectionKey[];

export const createLocalizedReadHubSectionSummaries = <
	TGroups extends ReadHubContentModuleGroups,
>(
	groups: TGroups,
	options: {
		locale?: string;
		defaultLocale?: string;
	} = {},
): ReadHubSectionSummaryMap<TGroups> => {
	const summaries = {} as ReadHubSectionSummaryMap<TGroups>;

	for (const sectionKey of READ_HUB_CONTENT_SECTION_KEYS) {
		const resolved = resolveLocalizedContent(
			buildLocalizedContentIndex(groups[sectionKey], {
				defaultLocale: options.defaultLocale,
			}),
			{ locale: options.locale },
		);

		summaries[sectionKey] = {
			count: resolved.entries.length,
			completeness: resolved.completeness,
			entries: resolved.entries,
		} as ReadHubSectionSummaryMap<TGroups>[typeof sectionKey];
	}

	return summaries;
};

export type ReadHubLatestChangeMap = Partial<
	Record<ReadHubSectionKey, ReadHubLatestChange>
>;

export const createDefaultReadHubSections = (
	stats: ReadHubSectionStatsMap,
	latestChanges: ReadHubLatestChangeMap = {},
): ReadHubSection[] => [
	{
		title: readSectionTitles.overview,
		description: "What the book is for, how it is framed, and its limits.",
		href: readRoutes.overview,
		count: 1,
		sectionKey: "overview",
		latestChange: latestChanges.overview,
	},
	{
		title: "Chapters",
		description: "The full argument, read in order.",
		href: readRoutes.chapters,
		count: stats.chapters.count,
		completeness: stats.chapters.completeness ?? null,
		sectionKey: "chapters",
		latestChange: latestChanges.chapters,
	},
	{
		title: "Mechanisms",
		description: "Named patterns and how to recognize them.",
		href: readRoutes.mechanisms,
		count: stats.mechanisms.count,
		completeness: stats.mechanisms.completeness ?? null,
		sectionKey: "mechanisms",
		latestChange: latestChanges.mechanisms,
	},
	{
		title: "Toolkit",
		description: "Actions that take ten minutes or less.",
		href: readRoutes.toolkit,
		count: stats.toolkit.count,
		completeness: stats.toolkit.completeness ?? null,
		sectionKey: "toolkit",
		latestChange: latestChanges.toolkit,
	},
	{
		title: "Glossary",
		description: "Definitions of the terms the book uses.",
		href: readRoutes.glossary,
		count: stats.glossary.count,
		completeness: stats.glossary.completeness ?? null,
		sectionKey: "glossary",
		latestChange: latestChanges.glossary,
	},
	{
		title: "Examples",
		description: "Worked cases for each mechanism.",
		href: readRoutes.examples,
		count: stats.examples.count,
		completeness: stats.examples.completeness ?? null,
		sectionKey: "examples",
		latestChange: latestChanges.examples,
	},
];
