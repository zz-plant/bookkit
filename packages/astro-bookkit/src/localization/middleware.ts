import type { MiddlewareHandler } from "astro";
import { ORIGINAL_URL_HEADER } from "../utils/request";
import {
	type LocaleEntry,
	resolveLocaleConfig,
	stripLocaleFromPath,
} from "./routes";

export type LocaleMiddlewareOptions = {
	locales: readonly LocaleEntry[];
	defaultLocale?: string;
	includeDefaultPrefix?: boolean;
};

export const createLocaleRoutingMiddleware = (
	options: LocaleMiddlewareOptions,
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

		const locals = context.locals as Record<string, unknown>;
		if (typeof locals.originalUrl !== "string") {
			locals.originalUrl = context.request.url;
		}
		const originalUrl = locals.originalUrl as string;

		const url = new URL(context.request.url);
		const { locale, pathWithoutLocale } = stripLocaleFromPath(
			url.pathname,
			localeCodes,
			{
				defaultLocale,
				includeDefaultPrefix: options.includeDefaultPrefix,
			},
		);

		const resolvedLocale = locale ?? defaultLocale ?? localeCodes[0];
		locals.locale = resolvedLocale;
		locals.localePath = pathWithoutLocale;

		if (locale && pathWithoutLocale !== url.pathname) {
			url.pathname = pathWithoutLocale;
			const rewrittenRequest = new Request(url, context.request);
			rewrittenRequest.headers.set(ORIGINAL_URL_HEADER, originalUrl);
			return next(rewrittenRequest);
		}

		return next();
	};
};
