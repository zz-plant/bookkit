import type { BookSeoConfig } from "./config";
import { resolveSiteUrl } from "./config";
import { buildAbsoluteUrl } from "./urls";
import { createRobotsTxt } from "./robots";
import type { SitemapEntry } from "./sitemap";

export type BookSitemapContentModules = {
  chapters?: Record<string, { frontmatter?: { slug?: string } }>;
  mechanisms?: Record<string, { frontmatter?: { slug?: string } }>;
  toolkit?: Record<string, { frontmatter?: { slug?: string } }>;
  glossary?: Record<string, { frontmatter?: { slug?: string } }>;
  examples?: Record<string, unknown>;
};

export type BookSitemapOptions = {
  site?: BookSeoConfig;
  basePaths?: string[];
  content?: BookSitemapContentModules;
};

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

const resolveSlug = (module: { frontmatter?: { slug?: string } } | undefined): string | undefined =>
  module?.frontmatter?.slug;

const resolveExampleSlug = (path: string): string | null => {
  const match = path.split("/examples/")[1];
  if (!match) return null;
  return match.replace(/\.mdx?$/, "");
};

const buildEntry = (siteUrl: string | undefined, path: string): SitemapEntry => ({
  url: siteUrl ? buildAbsoluteUrl(siteUrl, path) : path,
});

export const createBookSitemapEntries = ({
  site,
  basePaths = DEFAULT_BOOK_SITEMAP_PATHS,
  content = {},
}: BookSitemapOptions): SitemapEntry[] => {
  const siteUrl = resolveSiteUrl(site);
  const entries: SitemapEntry[] = basePaths.map((path) => buildEntry(siteUrl, path));

  content.chapters &&
    Object.values(content.chapters).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/chapters/${slug}`));
    });

  content.mechanisms &&
    Object.values(content.mechanisms).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/mechanisms/${slug}`));
    });

  content.toolkit &&
    Object.values(content.toolkit).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/toolkit/${slug}`));
    });

  content.glossary &&
    Object.values(content.glossary).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/glossary/${slug}`));
    });

  content.examples &&
    Object.keys(content.examples).forEach((path) => {
      const slug = resolveExampleSlug(path);
      if (slug) entries.push(buildEntry(siteUrl, `/read/examples/${slug}`));
    });

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
  const resolvedAllowAll = allowAll ?? (site?.indexable !== false);
  const defaultDisallowPaths = resolvedAllowAll ? ["/read/analytics"] : ["/"];
  const mergedDisallowPaths = Array.from(
    new Set([...defaultDisallowPaths, ...disallowPaths])
  );
  const host = includeHost && siteUrl ? new URL(siteUrl).host : undefined;
  const sitemapUrl =
    includeSitemap && siteUrl ? buildAbsoluteUrl(siteUrl, "/sitemap.xml") : undefined;

  return createRobotsTxt({
    allowAll: resolvedAllowAll,
    disallowPaths: mergedDisallowPaths,
    host,
    sitemapUrl,
  });
};
