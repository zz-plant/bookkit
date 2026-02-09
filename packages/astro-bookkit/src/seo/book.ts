import type { BookSeoConfig } from "./config";
import { resolveSiteUrl } from "./config";
import { buildAbsoluteUrl } from "./urls";
import { createRobotsTxt } from "./robots";
import type { SitemapEntry } from "./sitemap";

export type BookSitemapFrontmatter = {
  slug?: string;
  lastmod?: string;
  updatedAt?: string;
  updated?: string;
  date?: string;
};

export type BookSitemapContentModules = {
  chapters?: Record<string, { frontmatter?: BookSitemapFrontmatter }>;
  mechanisms?: Record<string, { frontmatter?: BookSitemapFrontmatter }>;
  toolkit?: Record<string, { frontmatter?: BookSitemapFrontmatter }>;
  glossary?: Record<string, { frontmatter?: BookSitemapFrontmatter }>;
  examples?: Record<string, { frontmatter?: BookSitemapFrontmatter } | unknown>;
};

export type BookSitemapOptions = {
  site?: BookSeoConfig;
  basePaths?: string[];
  content?: BookSitemapContentModules;
  defaultLastmod?: string;
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

const resolveSlug = (module: { frontmatter?: BookSitemapFrontmatter } | undefined): string | undefined =>
  module?.frontmatter?.slug;

const resolveLastmod = (module: { frontmatter?: BookSitemapFrontmatter } | undefined): string | undefined =>
  module?.frontmatter?.lastmod ??
  module?.frontmatter?.updatedAt ??
  module?.frontmatter?.updated ??
  module?.frontmatter?.date;

const resolveExampleSlug = (path: string): string | null => {
  const match = path.split("/examples/")[1];
  if (!match) return null;
  return match.replace(/\.mdx?$/, "");
};

const buildEntry = (
  siteUrl: string | undefined,
  path: string,
  options: { lastmod?: string } = {}
): SitemapEntry => ({
  url: siteUrl ? buildAbsoluteUrl(siteUrl, path) : path,
  lastmod: options.lastmod,
});

export const createBookSitemapEntries = ({
  site,
  basePaths = DEFAULT_BOOK_SITEMAP_PATHS,
  content = {},
  defaultLastmod,
}: BookSitemapOptions): SitemapEntry[] => {
  const siteUrl = resolveSiteUrl(site);
  const entries: SitemapEntry[] = basePaths.map((path) =>
    buildEntry(siteUrl, path, { lastmod: defaultLastmod })
  );

  content.chapters &&
    Object.values(content.chapters).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/chapters/${slug}`, { lastmod: resolveLastmod(module) ?? defaultLastmod }));
    });

  content.mechanisms &&
    Object.values(content.mechanisms).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/mechanisms/${slug}`, { lastmod: resolveLastmod(module) ?? defaultLastmod }));
    });

  content.toolkit &&
    Object.values(content.toolkit).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/toolkit/${slug}`, { lastmod: resolveLastmod(module) ?? defaultLastmod }));
    });

  content.glossary &&
    Object.values(content.glossary).forEach((module) => {
      const slug = resolveSlug(module);
      if (slug) entries.push(buildEntry(siteUrl, `/read/glossary/${slug}`, { lastmod: resolveLastmod(module) ?? defaultLastmod }));
    });

  content.examples &&
    Object.keys(content.examples).forEach((path) => {
      const slug = resolveExampleSlug(path);
      if (slug) {
        const module = content.examples?.[path];
        const frontmatter =
          module && typeof module === "object" && "frontmatter" in module
            ? (module as { frontmatter?: BookSitemapFrontmatter })
            : undefined;
        entries.push(buildEntry(siteUrl, `/read/examples/${slug}`, {
          lastmod: resolveLastmod(frontmatter) ?? defaultLastmod,
        }));
      }
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
