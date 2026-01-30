import { buildAbsoluteUrl, normalizeSiteUrl } from "./urls";

export type BookSeoDefaults = {
  description?: string;
  ogImage?: string;
};

export type BookSeoConfig = {
  url?: string;
  domains?: string[];
  enforceHttps?: boolean;
  indexable?: boolean;
  defaultMeta?: BookSeoDefaults;
};

export type SeoInput = {
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  robots?: string;
  canonicalPath?: string;
  canonicalUrl?: string;
};

export type SeoProps = SeoInput & {
  siteUrl?: string;
  metaDescription?: string;
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveOgImage = (image: string | undefined, siteUrl?: string): string | undefined => {
  if (!image) return undefined;
  if (isAbsoluteUrl(image)) return image;
  if (!siteUrl) return image;
  return buildAbsoluteUrl(siteUrl, image);
};

const normalizeCandidateUrls = (site?: BookSeoConfig): string[] =>
  [site?.url, ...(site?.domains ?? [])]
    .map((candidate) => (candidate ? normalizeSiteUrl(candidate, site?.enforceHttps) : ""))
    .filter(Boolean);

const resolveRequestHost = (requestUrl?: string): string | undefined => {
  if (!requestUrl) return undefined;
  try {
    return new URL(requestUrl).host;
  } catch (error) {
    return undefined;
  }
};

export const resolveSiteUrl = (
  site?: BookSeoConfig,
  requestUrl?: string
): string | undefined => {
  const candidates = normalizeCandidateUrls(site);
  if (!candidates.length) return undefined;
  const requestHost = resolveRequestHost(requestUrl);
  if (requestHost) {
    const matching = candidates.find((candidate) => new URL(candidate).host === requestHost);
    if (matching) return matching;
  }
  return candidates[0] || undefined;
};

export const buildSeoProps = ({
  site,
  requestUrl,
  description,
  ogTitle,
  ogDescription,
  ogImage,
  robots,
  canonicalPath,
  canonicalUrl,
}: SeoInput & { site?: BookSeoConfig; requestUrl?: string }): SeoProps => {
  const siteUrl = resolveSiteUrl(site, requestUrl);
  const resolvedDescription = description ?? site?.defaultMeta?.description;
  const resolvedOgImage = resolveOgImage(ogImage ?? site?.defaultMeta?.ogImage, siteUrl);
  const resolvedRobots = robots ?? (site?.indexable === false ? "noindex, nofollow" : undefined);

  return {
    siteUrl,
    metaDescription: resolvedDescription,
    ogTitle,
    ogDescription,
    ogImage: resolvedOgImage,
    canonicalPath,
    canonicalUrl,
    robots: resolvedRobots,
  };
};
