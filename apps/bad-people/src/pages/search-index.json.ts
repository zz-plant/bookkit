import { createBookSearchIndexEndpoint, createLocalizedSearchIndexEndpoint } from "@bookkit/astro-bookkit";
import type { APIContext } from "astro";
import { bookEntryPoints } from "../lib/book-entrypoints";

const modules = bookEntryPoints.contentRawModules;

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
