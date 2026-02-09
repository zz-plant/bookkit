import type { APIRoute } from "astro";
import { createBookSitemapEntries, createSitemapXml } from "@bookkit/astro-bookkit";
import type { BookSitemapContentModules } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { bookEntryPoints } from "../lib/book-entrypoints";
import { getReleaseNotes } from "../lib/release-notes";

export const GET: APIRoute = () => {
  const latestReleaseDate = getReleaseNotes()[0]?.date;
  const entries = createBookSitemapEntries({
    site: bookConfig.site,
    content: bookEntryPoints.contentModules as BookSitemapContentModules,
    defaultLastmod: latestReleaseDate,
  });

  const xml = createSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
