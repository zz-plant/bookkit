import { sequence } from "astro:middleware";
import { createPreviewAccessMiddleware } from "@bookkit/astro-bookkit/preview";
import { createVersionRoutingMiddleware } from "@bookkit/astro-bookkit";
import { createLocaleRoutingMiddleware } from "@bookkit/astro-bookkit/localization";
import bookConfig from "./book.config";
import { getVersionEntries } from "./lib/versions";

export const onRequest = sequence(
  createVersionRoutingMiddleware({
    versions: getVersionEntries(),
    prefixSegment: "v",
    defaultVersion: bookConfig.status,
  }),
  createLocaleRoutingMiddleware({
    locales: bookConfig.localization?.locales ?? [],
    defaultLocale: bookConfig.localization?.defaultLocale,
    includeDefaultPrefix: bookConfig.localization?.includeDefaultPrefix ?? false,
  }),
  createPreviewAccessMiddleware({
    ...bookConfig.previewAccess,
    siteTitle: bookConfig.title,
  })
);
