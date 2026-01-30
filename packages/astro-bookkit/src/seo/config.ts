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

export const resolveSiteUrl = (site?: BookSeoConfig): string | undefined => {
  const candidate = site?.url ?? site?.domains?.[0];
  if (!candidate) return undefined;
  const normalized = normalizeSiteUrl(candidate, site?.enforceHttps);
  return normalized || undefined;
};

export const buildSeoProps = ({
  site,
  description,
  ogTitle,
  ogDescription,
  ogImage,
  robots,
  canonicalPath,
  canonicalUrl,
}: SeoInput & { site?: BookSeoConfig }): SeoProps => {
  const siteUrl = resolveSiteUrl(site);
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
