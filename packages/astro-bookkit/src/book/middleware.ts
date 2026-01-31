import { sequence, type MiddlewareHandler } from "astro:middleware";
import { createVersionRoutingMiddleware } from "../releases/middleware";
import type { BookVersionEntry } from "../releases/versions";
import { createLocaleRoutingMiddleware } from "../localization/middleware";
import type { LocaleEntry } from "../localization/routes";
import { createPreviewAccessMiddleware } from "../preview/access";
import type { PreviewAccessConfig } from "../preview/access";

export type BookMiddlewareOptions = {
  versions: BookVersionEntry[];
  versionPrefix?: string;
  defaultVersion?: string;
  locales?: LocaleEntry[];
  defaultLocale?: string;
  includeDefaultLocalePrefix?: boolean;
  previewAccess?: PreviewAccessConfig;
  siteTitle?: string;
};

export const createBookMiddleware = (options: BookMiddlewareOptions): MiddlewareHandler => {
  const {
    versions,
    versionPrefix = "v",
    defaultVersion,
    locales = [],
    defaultLocale,
    includeDefaultLocalePrefix = false,
    previewAccess,
    siteTitle,
  } = options;
  const previewOptions = previewAccess ?? { tokens: [] };

  return sequence(
    createVersionRoutingMiddleware({
      versions,
      prefixSegment: versionPrefix,
      defaultVersion,
    }),
    createLocaleRoutingMiddleware({
      locales,
      defaultLocale,
      includeDefaultPrefix: includeDefaultLocalePrefix,
    }),
    createPreviewAccessMiddleware({
      ...previewOptions,
      siteTitle: siteTitle ?? "Preview",
    })
  );
};
