import type { APIRoute } from "astro";
import { createBookSitemapEntries, createSitemapXml } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

export const GET: APIRoute = () => {
  const entries = createBookSitemapEntries({
    site: bookConfig.site,
    content: {
      chapters: import.meta.glob("../content/book/chapters/*.mdx", { eager: true }),
      mechanisms: import.meta.glob("../content/book/mechanisms/*.mdx", { eager: true }),
      toolkit: import.meta.glob("../content/book/toolkit/*.mdx", { eager: true }),
      glossary: import.meta.glob("../content/book/glossary/*.mdx", { eager: true }),
      examples: import.meta.glob("../content/book/examples/**/*.mdx", { eager: true }),
    },
  });

  const xml = createSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
