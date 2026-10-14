import { isReleasedStatus } from "../schemas/status";
import { buildAbsoluteUrl, normalizeSiteUrl } from "./urls";

export type BookSeoDefaults = {
	description?: string;
	ogImage?: string;
};

export type BookSeoConfig = {
	url?: string;
	domains?: string[];
	enforceHttps?: boolean;
	indexable?: boolean;
	defaultMeta?: BookSeoDefaults;
	/**
	 * Chapters with fewer body words are kept out of search (noindex and left
	 * out of the sitemap) while still readable. Default 60; 0 turns it off.
	 */
	minIndexableWords?: number;
	/**
	 * Where the book is served. "static" (the default, and what `bookkit deploy`
	 * publishes) has no request handlers, so reader features that need one
	 * (feedback, Ask, analytics, per-locale and per-version routes) are left out
	 * instead of shown broken. Set "server" when an adapter serves the API routes.
	 */
	runtime?: "static" | "server";
};

export type SeoInput = {
	description?: string;
	ogTitle?: string;
	ogDescription?: string;
	ogImage?: string;
	ogType?: string;
	twitterCard?: "summary" | "summary_large_image" | "app" | "player";
	twitterTitle?: string;
	twitterDescription?: string;
	twitterImage?: string;
	ogSiteName?: string;
	ogLocale?: string;
	ogImageAlt?: string;
	twitterImageAlt?: string;
	structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
	robots?: string;
	canonicalPath?: string;
	canonicalUrl?: string;
};

export type SeoProps = SeoInput & {
	siteUrl?: string;
	metaDescription?: string;
};

/**
 * The site settings a build applies to a book. Only a released book (status
 * published or stable) is offered to search engines; before that, whatever
 * `site.indexable` says, every page is noindex, robots.txt disallows
 * crawling, and the sitemap lists no pages. A released book can still opt out
 * with `indexable: false`.
 */
export const resolveBookSite = (book: {
	status?: string;
	site?: BookSeoConfig;
}): BookSeoConfig => ({
	...book.site,
	indexable: book.site?.indexable !== false && isReleasedStatus(book.status),
});

/** Whether request handlers serve this book; see `BookSeoConfig.runtime`. */
export const hasServerRuntime = (site?: BookSeoConfig): boolean =>
	site?.runtime === "server";

/**
 * The reader features a page may offer where the book is served: analytics
 * and feedback need request handlers, and Ask needs them and `features.aiQa`.
 */
export const runtimeFeatures = (book: {
	site?: BookSeoConfig;
	features?: { aiQa?: boolean };
}): { hasServerRuntime: boolean; aiQaEnabled: boolean } => {
	const server = hasServerRuntime(book.site);
	return {
		hasServerRuntime: server,
		aiQaEnabled: server && (book.features?.aiQa ?? true),
	};
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveOgImage = (
	image: string | undefined,
	siteUrl?: string,
): string | undefined => {
	if (!image) return undefined;
	if (isAbsoluteUrl(image)) return image;
	if (!siteUrl) return image;
	return buildAbsoluteUrl(siteUrl, image);
};

const resolveCanonicalUrl = ({
	canonicalUrl,
	canonicalPath,
	siteUrl,
}: {
	canonicalUrl?: string;
	canonicalPath?: string;
	siteUrl?: string;
}): string | undefined => {
	if (canonicalUrl) return canonicalUrl;
	if (!canonicalPath) return undefined;
	if (!siteUrl) return canonicalPath;
	return buildAbsoluteUrl(siteUrl, canonicalPath);
};

const normalizeCandidateUrls = (site?: BookSeoConfig): string[] =>
	[site?.url, ...(site?.domains ?? [])]
		.map((candidate) =>
			candidate ? normalizeSiteUrl(candidate, site?.enforceHttps) : "",
		)
		.filter(Boolean);

const resolveRequestHost = (requestUrl?: string): string | undefined => {
	if (!requestUrl) return undefined;
	try {
		return new URL(requestUrl).host;
	} catch (error) {
		return undefined;
	}
};

export const resolveSiteUrl = (
	site?: BookSeoConfig,
	requestUrl?: string,
): string | undefined => {
	const candidates = normalizeCandidateUrls(site);
	if (!candidates.length) return undefined;
	const requestHost = resolveRequestHost(requestUrl);
	if (requestHost) {
		const matching = candidates.find(
			(candidate) => new URL(candidate).host === requestHost,
		);
		if (matching) return matching;
	}
	return candidates[0] || undefined;
};

export const buildSeoProps = ({
	site,
	requestUrl,
	description,
	ogTitle,
	ogDescription,
	ogImage,
	ogType,
	twitterCard,
	twitterTitle,
	twitterDescription,
	twitterImage,
	ogSiteName,
	ogLocale,
	ogImageAlt,
	twitterImageAlt,
	structuredData,
	robots,
	canonicalPath,
	canonicalUrl,
}: SeoInput & { site?: BookSeoConfig; requestUrl?: string }): SeoProps => {
	const siteUrl = resolveSiteUrl(site, requestUrl);
	const resolvedDescription = description ?? site?.defaultMeta?.description;
	const resolvedOgImage = resolveOgImage(
		ogImage ?? site?.defaultMeta?.ogImage,
		siteUrl,
	);
	const resolvedRobots =
		robots ?? (site?.indexable === false ? "noindex, nofollow" : undefined);
	const resolvedCanonicalUrl = resolveCanonicalUrl({
		canonicalUrl,
		canonicalPath,
		siteUrl,
	});

	return {
		siteUrl,
		metaDescription: resolvedDescription,
		ogTitle,
		ogDescription,
		ogImage: resolvedOgImage,
		ogType,
		twitterCard,
		twitterTitle,
		twitterDescription,
		twitterImage: resolveOgImage(twitterImage, siteUrl),
		ogSiteName,
		ogLocale,
		ogImageAlt,
		twitterImageAlt,
		structuredData,
		canonicalPath,
		canonicalUrl: resolvedCanonicalUrl,
		robots: resolvedRobots,
	};
};
