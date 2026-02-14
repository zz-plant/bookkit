import { createBookSearchIndexEndpoint, createLocalizedSearchIndexEndpoint } from "@bookkit/astro-bookkit";
import type { APIRoute } from "astro";
import { bookEntryPoints } from "../lib/book-entrypoints";

const modules = bookEntryPoints.contentRawModules;

const defaultEndpoint = createBookSearchIndexEndpoint(modules);
const localizedEndpoint = createLocalizedSearchIndexEndpoint(modules, {
  defaultLocale: "en",
});

export const GET: APIRoute = (context) => {
  const url = new URL(context.request.url);
  if (url.searchParams.has("locale")) {
    return localizedEndpoint.GET(context);
  }
  return defaultEndpoint.GET();
};
