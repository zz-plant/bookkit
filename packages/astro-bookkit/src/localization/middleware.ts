import type { MiddlewareHandler } from "astro";
import { resolveLocaleConfig, stripLocaleFromPath, type LocaleEntry } from "./routes";

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
      return next(new Request(url, context.request));
    }

    return next();
  };
};
