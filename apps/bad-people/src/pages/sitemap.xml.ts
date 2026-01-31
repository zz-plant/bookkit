import type { APIRoute } from "astro";
import { createBookSitemapEntries, createSitemapXml } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { bookEntryPoints } from "../lib/book-entrypoints";

export const GET: APIRoute = () => {
  const entries = createBookSitemapEntries({
    site: bookConfig.site,
    content: bookEntryPoints.contentModules,
  });

  const xml = createSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
