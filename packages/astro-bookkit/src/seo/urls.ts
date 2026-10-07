export type SiteUrlOptions = {
  enforceHttps?: boolean;
};

const withProtocol = (rawUrl: string, enforceHttps?: boolean): string => {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const trimmed = rawUrl.replace(/^\/\//, "");
  const protocol = enforceHttps ? "https" : "http";
  return `${protocol}://${trimmed}`;
};

export const normalizeSiteUrl = (siteUrl: string, enforceHttps?: boolean): string => {
  const trimmed = siteUrl.trim();
  if (!trimmed) return "";
  const normalized = withProtocol(trimmed, enforceHttps);
  const url = new URL(normalized);
  if (enforceHttps) {
    url.protocol = "https:";
  }
  return url.toString().replace(/\/$/, "");
};

/**
 * A page path in canonical form: no trailing slash except the root. This is
 * how the static host serves pages (`drop-trailing-slash`) and how the sitemap
 * lists them; the slashed form answers with a redirect.
 */
export const canonicalPathname = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname || "/";

/** An absolute URL with its path in canonical form. */
export const canonicalPageUrl = (url: URL | string): string => {
  const resolved = new URL(url.toString());
  resolved.pathname = canonicalPathname(resolved.pathname);
  return resolved.toString();
};

export const buildAbsoluteUrl = (siteUrl: string, path: string): string => {
  if (!siteUrl) return path;
  const url = new URL(path, siteUrl);
  return url.toString();
};
