import type { APIRoute } from "astro";
import { buildAbsoluteUrl, createSitemapXml, normalizeSiteUrl } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

const siteUrl = bookConfig.site?.url
  ? normalizeSiteUrl(bookConfig.site.url, bookConfig.site.enforceHttps)
  : "";

const buildEntry = (path: string) => ({
  url: buildAbsoluteUrl(siteUrl, path),
});

export const GET: APIRoute = () => {
  const basePaths = [
    "/",
    "/read",
    "/read/overview",
    "/read/chapters",
    "/read/mechanisms",
    "/read/toolkit",
    "/read/glossary",
    "/read/examples",
    "/release-notes",
  ];

  const chapterModules = Object.values(
    import.meta.glob("../content/book/chapters/*.mdx", { eager: true })
  );
  const mechanismModules = Object.values(
    import.meta.glob("../content/book/mechanisms/*.mdx", { eager: true })
  );
  const toolkitModules = Object.values(
    import.meta.glob("../content/book/toolkit/*.mdx", { eager: true })
  );
  const glossaryModules = Object.values(
    import.meta.glob("../content/book/glossary/*.mdx", { eager: true })
  );
  const exampleModules = Object.entries(
    import.meta.glob("../content/book/examples/**/*.mdx", { eager: true })
  );

  const entries = [
    ...basePaths.map(buildEntry),
    ...chapterModules.map((module: any) => buildEntry(`/read/chapters/${module.frontmatter.slug}`)),
    ...mechanismModules.map((module: any) => buildEntry(`/read/mechanisms/${module.frontmatter.slug}`)),
    ...toolkitModules.map((module: any) => buildEntry(`/read/toolkit/${module.frontmatter.slug}`)),
    ...glossaryModules.map((module: any) => buildEntry(`/read/glossary/${module.frontmatter.slug}`)),
    ...exampleModules.map(([path]) =>
      buildEntry(`/read/examples/${path.split("/examples/")[1].replace(/\.mdx$/, "")}`)
    ),
  ];

  const xml = createSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
