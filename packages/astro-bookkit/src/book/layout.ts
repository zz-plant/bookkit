import { buildSeoProps, type SeoProps } from "../seo/config";
import { extractVersionFromPath } from "../releases/versions";
import type { BookVersionEntry } from "../releases/versions";
import {
  buildLocalizedContentIndex,
  calculateLocaleCompleteness,
  mergeLocaleCompleteness,
  type LocaleEntry,
} from "../localization";
import { getPreviewContext, type PreviewAccessState } from "../preview";

type BookLayoutAstroProps = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  robots?: string;
  canonicalPath?: string;
  canonicalUrl?: string;
};

type BookLayoutAstroContext = {
  props: BookLayoutAstroProps;
  locals?: Record<string, unknown>;
  url: URL;
};

type BookLayoutLocalization = {
  defaultLocale?: string;
  locales?: LocaleEntry[];
  includeDefaultPrefix?: boolean;
  label?: string;
};

export type BookLayoutConfig = {
  site: Parameters<typeof buildSeoProps>[0]["site"];
  title: string;
  status?: string;
  slug?: string;
  features?: {
    aiQa?: boolean;
  };
  localization?: BookLayoutLocalization;
};

type BookLayoutContentModule = {
  frontmatter?: {
    slug?: string;
    locale?: string;
  };
};

export type BookLayoutState = {
  seoProps: SeoProps;
  previewContext: PreviewAccessState | null;
  previewRobots?: string;
  versionEntries: BookVersionEntry[];
  resolvedVersion?: string;
  resolvedLocales: LocaleEntry[];
  bookTitle: string;
  bookKey: string;
  aiQaEnabled: boolean;
  currentLocale?: string;
  defaultLocale: string;
  includeDefaultLocalePrefix: boolean;
  localeLabel: string;
};

export type BookLayoutOptions = {
  astro: BookLayoutAstroContext;
  bookConfig: BookLayoutConfig;
  versionEntries: BookVersionEntry[];
  localizedContentModules: Array<Record<string, BookLayoutContentModule>>;
  versionPrefix?: string;
};

export const createBookLayoutState = (options: BookLayoutOptions): BookLayoutState => {
  const { astro, bookConfig, versionEntries, localizedContentModules, versionPrefix = "v" } =
    options;
  const { props, locals, url } = astro;
  const seoProps = buildSeoProps({
    site: bookConfig.site,
    requestUrl: locals?.originalUrl ?? url.toString(),
    description: props.description,
    ogTitle: props.ogTitle,
    ogDescription: props.ogDescription,
    ogImage: props.ogImage,
    robots: props.robots,
    canonicalPath: props.canonicalPath,
    canonicalUrl: props.canonicalUrl,
  });
  const previewContext = getPreviewContext(locals ?? {});
  const previewRobots = previewContext?.isPreview ? "noindex, nofollow" : props.robots;
  const originalUrl = typeof locals?.originalUrl === "string" ? new URL(locals.originalUrl) : null;
  const pathVersion = extractVersionFromPath(originalUrl?.pathname ?? url.pathname, {
    prefixSegment: versionPrefix,
  });
  const latestVersion = versionEntries.find((entry) => entry.isLatest)?.version;
  const resolvedVersion =
    (locals?.bookVersion as string | undefined) ??
    pathVersion ??
    latestVersion ??
    bookConfig.status;
  const defaultLocale = bookConfig.localization?.defaultLocale ?? "en";
  const localeIndexes = localizedContentModules.map((modules) =>
    buildLocalizedContentIndex(modules, { defaultLocale })
  );
  const localeCompleteness = calculateLocaleCompleteness(localeIndexes, {
    locales: bookConfig.localization?.locales?.map((locale) => locale.code) ?? [],
  });
  const resolvedLocales = mergeLocaleCompleteness(
    bookConfig.localization?.locales ?? [],
    localeCompleteness
  );

  return {
    seoProps,
    previewContext,
    previewRobots,
    versionEntries,
    resolvedVersion,
    resolvedLocales,
    bookTitle: bookConfig.title,
    bookKey: bookConfig.slug ?? "book",
    aiQaEnabled: bookConfig.features?.aiQa ?? true,
    currentLocale: locals?.locale as string | undefined,
    defaultLocale,
    includeDefaultLocalePrefix: bookConfig.localization?.includeDefaultPrefix ?? false,
    localeLabel: bookConfig.localization?.label ?? "Language",
  };
};
