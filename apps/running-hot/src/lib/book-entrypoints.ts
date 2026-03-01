import { createBookEntryPointsFromGlob } from "@bookkit/astro-bookkit";

export const bookEntryPoints = createBookEntryPointsFromGlob(import.meta.glob, {
  contentRoot: "../content/book",
});
