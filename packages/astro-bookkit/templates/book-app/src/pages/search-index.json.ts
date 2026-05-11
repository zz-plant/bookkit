import { createSearchIndexGetHandler } from "@bookkit/astro-bookkit";

import { bookEntryPoints } from "../lib/book-entrypoints";

export const GET = createSearchIndexGetHandler({
  modules: bookEntryPoints.contentRawModules,
  defaultLocale: "en",
});