import type { APIRoute } from "astro";
import { createReleaseNotesRssResponse, normalizeSiteUrl } from "@bookkit/astro-bookkit";
import { getReleaseNotes } from "../lib/release-notes";
import bookConfig from "../book.config";

const siteUrl =
  (bookConfig.site?.url
    ? normalizeSiteUrl(bookConfig.site.url, bookConfig.site.enforceHttps)
    : null) ?? import.meta.env.SITE_URL || "http://localhost:4321";

export const GET: APIRoute = () => {
  const releases = getReleaseNotes();
  return createReleaseNotesRssResponse({
    siteUrl,
    bookTitle: bookConfig.title,
    releases,
  });
};
