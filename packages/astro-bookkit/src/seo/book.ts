import { buildLocalizedContentIndex } from "../localization/content";
import { extractPageFacts } from "../markdown/pageFacts";
import type { BookSeoConfig } from "./config";
import { resolveSiteUrl } from "./config";
import { isThinPage } from "./page-meta";
import { createRobotsTxt } from "./robots";
import type { SitemapEntry } from "./sitemap";
import { buildAbsoluteUrl } from "./urls";

export type BookSitemapFrontmatter = {
	slug?: string;
	locale?: string;
	lastmod?: string;
	updatedAt?: string;
	updated?: string;
	date?: string;
};

type BookSitemapModule = { frontmatter?: BookSitemapFrontmatter };

export type BookSitemapContentModules = {
	chapters?: Record<string, BookSitemapModule>;
	mechanisms?: Record<string, BookSitemapModule>;
	toolkit?: Record<string, BookSitemapModule>;
	glossary?: Record<string, BookSitemapModule>;
	examples?: Record<string, BookSitemapModule>;
};

export type BookSitemapOptions = {
	site?: BookSeoConfig;
	basePaths?: string[];
	content?: BookSitemapContentModules;
	/** Raw MDX source under the same keys as `content`, used to leave stub chapters out. */
	contentRaw?: Partial<
		Record<keyof BookSitemapContentModules, Record<string, string>>
	>;
	defaultLastmod?: string;
	/** Locale whose pages live at unprefixed paths. */
	defaultLocale?: string;
};

/**
 * Pages for authors, not readers. They stay reachable but out of search:
 * robots.txt disallows them and the pages carry noindex.
 */
export const AUTHOR_ONLY_PATHS = [
	"/read/analytics",
	"/read/tools",
	"/new-book",
];

export type BookRobotsOptions = {
	site?: BookSeoConfig;
	allowAll?: boolean;
	disallowPaths?: string[];
	includeHost?: boolean;
	includeSitemap?: boolean;
};

export const DEFAULT_BOOK_SITEMAP_PATHS = [
	"/",
	"/read",
	"/read/overview",
	"/read/chapters",
	"/read/mechanisms",
	"/read/toolkit",
	"/read/glossary",
	"/read/examples",
	"/release-notes",
];

const resolveLastmod = (
	module: { frontmatter?: BookSitemapFrontmatter } | undefined,
): string | undefined =>
	module?.frontmatter?.lastmod ??
	module?.frontmatter?.updatedAt ??
	module?.frontmatter?.updated ??
	module?.frontmatter?.date;

const SECTIONS = [
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
] as const;

const buildEntry = (
	siteUrl: string | undefined,
	path: string,
	options: { lastmod?: string } = {},
): SitemapEntry => ({
	url: siteUrl ? buildAbsoluteUrl(siteUrl, path) : path,
	lastmod: options.lastmod,
});

export const createBookSitemapEntries = ({
	site,
	basePaths = DEFAULT_BOOK_SITEMAP_PATHS,
	content = {},
	contentRaw = {},
	defaultLastmod,
	defaultLocale = "en",
}: BookSitemapOptions): SitemapEntry[] => {
	// A site kept out of search lists nothing: a sitemap is an invitation to index.
	if (site?.indexable === false) return [];
	const siteUrl = resolveSiteUrl(site);
	const entries: SitemapEntry[] = basePaths.map((path) =>
		buildEntry(siteUrl, path, { lastmod: defaultLastmod }),
	);

	// Slugs come from the same index the read routes are built from, so every
	// entry is a page that exists. Only the default locale's pages are listed.
	for (const section of SECTIONS) {
		const modules = content[section];
		if (!modules) continue;
		const index = buildLocalizedContentIndex(modules, { defaultLocale });
		const pathOf = new Map(
			Object.entries(modules).map(([path, module]) => [module, path]),
		);
		for (const slug of index.slugs) {
			const module = index.bySlug[slug]?.[index.defaultLocale];
			if (!module) continue;
			const source = contentRaw[section]?.[pathOf.get(module) ?? ""];
			if (
				section === "chapters" &&
				typeof source === "string" &&
				isThinPage(extractPageFacts(source).wordCount, site)
			) {
				continue;
			}
			entries.push(
				buildEntry(siteUrl, `/read/${section}/${slug}`, {
					lastmod: resolveLastmod(module) ?? defaultLastmod,
				}),
			);
		}
	}

	return entries;
};

export const createBookRobotsTxt = ({
	site,
	allowAll,
	disallowPaths = [],
	includeHost = true,
	includeSitemap = true,
}: BookRobotsOptions): string => {
	const siteUrl = resolveSiteUrl(site);
	const resolvedAllowAll = allowAll ?? site?.indexable !== false;
	const defaultDisallowPaths = resolvedAllowAll ? AUTHOR_ONLY_PATHS : ["/"];
	const mergedDisallowPaths = Array.from(
		new Set([...defaultDisallowPaths, ...disallowPaths]),
	);
	const host = includeHost && siteUrl ? new URL(siteUrl).host : undefined;
	// A site closed to crawlers has an empty sitemap; do not point them at it.
	const sitemapUrl =
		includeSitemap && siteUrl && resolvedAllowAll
			? buildAbsoluteUrl(siteUrl, "/sitemap.xml")
			: undefined;

	return createRobotsTxt({
		allowAll: resolvedAllowAll,
		disallowPaths: mergedDisallowPaths,
		host,
		sitemapUrl,
	});
};
