import type { MiddlewareHandler } from "astro";
import { sequence } from "astro/middleware";
import { createLocaleRoutingMiddleware } from "../localization/middleware";
import type { LocaleEntry } from "../localization/routes";
import type { PreviewAccessConfig } from "../preview/access";
import { createPreviewAccessMiddleware } from "../preview/access";
import { createVersionRoutingMiddleware } from "../releases/middleware";
import type { BookVersionEntry } from "../releases/versions";

export type BookMiddlewareOptions = {
	versions: readonly BookVersionEntry[];
	versionPrefix?: string;
	defaultVersion?: string;
	locales?: readonly LocaleEntry[];
	defaultLocale?: string;
	includeDefaultLocalePrefix?: boolean;
	previewAccess?: PreviewAccessConfig;
	siteTitle?: string;
};

export const createBookMiddleware = (
	options: BookMiddlewareOptions,
): MiddlewareHandler => {
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
		}),
	);
};
