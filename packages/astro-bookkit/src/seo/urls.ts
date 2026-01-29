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

export const buildAbsoluteUrl = (siteUrl: string, path: string): string => {
  if (!siteUrl) return path;
  const url = new URL(path, siteUrl);
  return url.toString();
};
