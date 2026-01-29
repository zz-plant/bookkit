import type { APIRoute } from "astro";
import { buildAbsoluteUrl, createRobotsTxt, normalizeSiteUrl } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

const siteUrl = bookConfig.site?.url
  ? normalizeSiteUrl(bookConfig.site.url, bookConfig.site.enforceHttps)
  : "";

const indexable = bookConfig.site?.indexable !== false;
const disallowPaths = indexable ? ["/read/analytics"] : ["/"];

export const GET: APIRoute = () => {
  const host = siteUrl ? new URL(siteUrl).host : undefined;
  const sitemapUrl = siteUrl ? buildAbsoluteUrl(siteUrl, "/sitemap.xml") : undefined;
  const txt = createRobotsTxt({
    allowAll: indexable,
    disallowPaths,
    host,
    sitemapUrl,
  });

  return new Response(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
