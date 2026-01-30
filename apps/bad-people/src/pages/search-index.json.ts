import { createBookSearchIndexEndpoint, createLocalizedSearchIndexEndpoint } from "@bookkit/astro-bookkit";
import type { APIContext } from "astro";

const modules = {
  chapters: import.meta.glob<string>("../content/book/chapters/*.mdx", {
    eager: true,
    as: "raw",
  }),
  mechanisms: import.meta.glob<string>("../content/book/mechanisms/*.mdx", {
    eager: true,
    as: "raw",
  }),
  toolkit: import.meta.glob<string>("../content/book/toolkit/*.mdx", {
    eager: true,
    as: "raw",
  }),
  glossary: import.meta.glob<string>("../content/book/glossary/*.mdx", {
    eager: true,
    as: "raw",
  }),
  examples: import.meta.glob<string>("../content/book/examples/**/*.mdx", {
    eager: true,
    as: "raw",
  }),
};

const { GET: getDefault } = createBookSearchIndexEndpoint(modules);
const { GET: getLocalized } = createLocalizedSearchIndexEndpoint(modules, {
  defaultLocale: "en",
});

export const GET: typeof getLocalized = (context: APIContext) => {
  const url = new URL(context.request.url);
  if (url.searchParams.has("locale")) {
    return getLocalized(context);
  }
  return getDefault();
};
