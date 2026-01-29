import { createSearchIndexResponse } from "@bookkit/astro-bookkit";

const contentSources = [
  {
    type: "chapters",
    label: "Chapters",
    path: "../content/book/chapters/*.mdx",
    urlPrefix: "/read/chapters/",
    titleKey: "title",
  },
  {
    type: "mechanisms",
    label: "Mechanisms",
    path: "../content/book/mechanisms/*.mdx",
    urlPrefix: "/read/mechanisms/",
    titleKey: "title",
  },
  {
    type: "toolkit",
    label: "Toolkit",
    path: "../content/book/toolkit/*.mdx",
    urlPrefix: "/read/toolkit/",
    titleKey: "name",
  },
  {
    type: "glossary",
    label: "Glossary",
    path: "../content/book/glossary/*.mdx",
    urlPrefix: "/read/glossary/",
    titleKey: "term",
  },
  {
    type: "examples",
    label: "Examples",
    path: "../content/book/examples/**/*.mdx",
    urlPrefix: "/read/examples/",
    titleKey: "title",
  },
];

export async function GET() {
  const sources = contentSources.map((source) => ({
    ...source,
    modules: import.meta.glob<string>(source.path, { eager: true, as: "raw" }),
  }));
  return createSearchIndexResponse(sources);
}
