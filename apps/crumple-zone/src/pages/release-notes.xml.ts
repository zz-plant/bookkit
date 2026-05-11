import { createReleaseNotesRssEndpoint, normalizeSiteUrl } from "@bookkit/astro-bookkit";
import { releaseModules } from "../lib/release-notes";
import bookConfig from "../book.config";

const siteUrl =
  (bookConfig.site?.url
    ? normalizeSiteUrl(bookConfig.site.url, bookConfig.site.enforceHttps)
    : null) ?? (import.meta.env.SITE_URL || "http://localhost:4321");

export const { GET } = createReleaseNotesRssEndpoint({
  modules: releaseModules,
  siteUrl,
  bookTitle: bookConfig.title,
});
