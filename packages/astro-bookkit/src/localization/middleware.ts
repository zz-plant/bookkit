import type { MiddlewareHandler } from "astro";
import { resolveLocaleConfig, stripLocaleFromPath, type LocaleEntry } from "./routes";
import { ORIGINAL_URL_HEADER } from "../utils/request";

export type LocaleMiddlewareOptions = {
  locales: LocaleEntry[];
  defaultLocale?: string;
  includeDefaultPrefix?: boolean;
};

export const createLocaleRoutingMiddleware = (
  options: LocaleMiddlewareOptions
): MiddlewareHandler => {
  const localeEntries = Array.isArray(options.locales) ? options.locales : [];
  const localeCodes = localeEntries.map((entry) => entry.code).filter(Boolean);
  const { defaultLocale } = resolveLocaleConfig(localeEntries, {
    defaultLocale: options.defaultLocale,
  });

  return async (context, next) => {
    if (!localeCodes.length) {
      return next();
    }

    if (typeof context.locals.originalUrl !== "string") {
      context.locals.originalUrl = context.request.url;
    }
    const originalUrl = context.locals.originalUrl;

    const url = new URL(context.request.url);
    const { locale, pathWithoutLocale } = stripLocaleFromPath(url.pathname, localeCodes, {
      defaultLocale,
      includeDefaultPrefix: options.includeDefaultPrefix,
    });

    const resolvedLocale = locale ?? defaultLocale ?? localeCodes[0];
    context.locals.locale = resolvedLocale;
    context.locals.localePath = pathWithoutLocale;

    if (locale && pathWithoutLocale !== url.pathname) {
      url.pathname = pathWithoutLocale;
      const rewrittenRequest = new Request(url, context.request);
      rewrittenRequest.headers.set(ORIGINAL_URL_HEADER, originalUrl);
      return next(rewrittenRequest);
    }

    return next();
  };
};
