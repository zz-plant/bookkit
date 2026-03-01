import { buildLocalePath } from "../../localization/routes";

type LocaleEntry = { code: string };

export const computeLayoutMetadata = ({
  robots,
  pathVersion,
  currentVersionIsLatest,
  versionArchiveNoindex,
  isArchivePage,
  ogTitle,
  pageTitle,
  ogDescription,
  metaDescription,
  twitterCard,
  twitterImage,
  ogImage,
  twitterTitle,
  twitterDescription,
  ogSiteName,
  bookTitle,
  ogLocale,
  activeLocale,
  ogImageAlt,
  twitterImageAlt,
  resolvedCanonical,
  structuredData,
  siteUrl,
  localeEntries,
  pathWithoutLocale,
  pathWithoutVersion,
  resolvedDefaultLocale,
  includeDefaultLocalePrefix,
}: {
  robots?: string;
  pathVersion?: string | null;
  currentVersionIsLatest?: boolean;
  versionArchiveNoindex: boolean;
  isArchivePage: boolean;
  ogTitle?: string;
  pageTitle: string;
  ogDescription?: string;
  metaDescription?: string;
  twitterCard?: string;
  twitterImage?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  ogSiteName?: string;
  bookTitle: string;
  ogLocale?: string;
  activeLocale?: string;
  ogImageAlt?: string;
  twitterImageAlt?: string;
  resolvedCanonical?: string;
  structuredData?: unknown;
  siteUrl?: string;
  localeEntries: LocaleEntry[];
  pathWithoutLocale?: string;
  pathWithoutVersion: string;
  resolvedDefaultLocale?: string;
  includeDefaultLocalePrefix: boolean;
}) => {
  const resolvedRobots =
    robots ??
    ((pathVersion && !currentVersionIsLatest) || (versionArchiveNoindex && isArchivePage)
      ? "noindex, nofollow"
      : undefined);
  const resolvedOgTitle = ogTitle ?? pageTitle;
  const resolvedOgDescription = ogDescription ?? metaDescription;
  const resolvedTwitterCard = twitterCard ?? (twitterImage || ogImage ? "summary_large_image" : "summary");
  const resolvedTwitterTitle = twitterTitle ?? resolvedOgTitle;
  const resolvedTwitterDescription = twitterDescription ?? resolvedOgDescription;
  const resolvedTwitterImage = twitterImage ?? ogImage;
  const resolvedOgSiteName = ogSiteName ?? bookTitle;
  const resolvedOgLocale = ogLocale ?? activeLocale;
  const resolvedTwitterImageAlt = twitterImageAlt ?? ogImageAlt;

  const defaultStructuredData = [
    resolvedCanonical
      ? {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: pageTitle,
          description: metaDescription,
          url: resolvedCanonical,
          inLanguage: activeLocale,
          isPartOf: siteUrl
            ? { "@type": "WebSite", name: bookTitle, url: siteUrl }
            : undefined,
        }
      : null,
  ].filter(Boolean);
  const customStructuredData = Array.isArray(structuredData) ? structuredData : structuredData ? [structuredData] : [];
  const structuredDataScripts = [...defaultStructuredData, ...customStructuredData];

  const hreflangEntries =
    siteUrl && localeEntries.length
      ? localeEntries.map((entry) => ({
          locale: entry.code,
          href: new URL(
            buildLocalePath(pathWithoutLocale ?? pathWithoutVersion, entry.code, {
              defaultLocale: resolvedDefaultLocale,
              includeDefaultPrefix: includeDefaultLocalePrefix,
            }),
            siteUrl,
          ).toString(),
        }))
      : [];

  const hreflangDefault =
    siteUrl && resolvedDefaultLocale
      ? new URL(
          buildLocalePath(pathWithoutLocale ?? pathWithoutVersion, resolvedDefaultLocale, {
            defaultLocale: resolvedDefaultLocale,
            includeDefaultPrefix: includeDefaultLocalePrefix,
          }),
          siteUrl,
        ).toString()
      : null;

  return {
    resolvedRobots,
    resolvedOgTitle,
    resolvedOgDescription,
    resolvedTwitterCard,
    resolvedTwitterTitle,
    resolvedTwitterDescription,
    resolvedTwitterImage,
    resolvedOgSiteName,
    resolvedOgLocale,
    resolvedTwitterImageAlt,
    structuredDataScripts,
    hreflangEntries,
    hreflangDefault,
  };
};
