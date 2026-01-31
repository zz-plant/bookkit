import { createBookMiddleware } from "@bookkit/astro-bookkit";
import bookConfig from "./book.config";
import { getVersionEntries } from "./lib/versions";

export const onRequest = createBookMiddleware({
  versions: getVersionEntries(),
  versionPrefix: "v",
  defaultVersion: bookConfig.status,
  locales: bookConfig.localization?.locales ?? [],
  defaultLocale: bookConfig.localization?.defaultLocale,
  includeDefaultLocalePrefix: bookConfig.localization?.includeDefaultPrefix ?? false,
  previewAccess: bookConfig.previewAccess,
  siteTitle: bookConfig.title,
});
