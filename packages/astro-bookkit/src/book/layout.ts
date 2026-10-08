import {
	type BookAuthor,
	computeLayoutMetadata,
	type LayoutMetadataState,
} from "../layouts/book-layout/metadata";
import {
	buildLocalizedContentIndex,
	calculateLocaleCompleteness,
	type LocaleEntry,
	mergeLocaleCompleteness,
	resolveLocaleConfig,
	stripLocaleFromPath,
} from "../localization";
import { getPreviewContext, type PreviewAccessState } from "../preview";
import {
	type BookVersionEntry,
	extractVersionFromPath,
	stripVersionFromPath,
} from "../releases/versions";
import {
	buildSeoProps,
	type SeoProps,
	hasServerRuntime as siteHasServerRuntime,
} from "../seo/config";
import { canonicalPathname } from "../seo/urls";

type BookLayoutAstroProps = {
	title?: string;
	hasMermaid?: boolean;
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

type BookLayoutAstroContext = {
	props: BookLayoutAstroProps;
	locals?: App.Locals;
	url: URL;
};

type BookLayoutLocalization = {
	defaultLocale?: string;
	locales?: readonly LocaleEntry[];
	includeDefaultPrefix?: boolean;
	label?: string;
};

export type BookLayoutConfig = {
	site: Parameters<typeof buildSeoProps>[0]["site"];
	title: string;
	/** The byline: shown in the colophon, previews, and metadata. */
	author?: BookAuthor;
	status?: string;
	slug?: string;
	features?: {
		aiQa?: boolean;
		aiQaProvider?: import("../qa").AiQaProviderConfig;
		aiQaProviders?: import("../qa").AiQaProviderConfig[];
	};
	localization?: BookLayoutLocalization;
};

type BookLayoutContentModule = {
	frontmatter?: {
		slug?: string;
		locale?: string;
	};
};

export type BookLayoutTranslationNoticeState = {
	show: boolean;
	activeLocale?: string;
	activeLocaleLabel?: string;
	defaultLocale: string;
	defaultLocaleLabel?: string;
	completeness: number | null;
	percentage: number | null;
};

export type BookLayoutPreviewDisplayState = {
	isPreview: boolean;
	label: string;
	tokenHint?: string;
	expiresAt?: string;
	expiresLabel: string | null;
	details: string[];
};

export type BookLayoutRouteState = {
	requestPathname: string;
	normalizedPath: string;
	normalizedLocalePath: string;
	pathWithoutLocale: string;
	pathWithoutVersion: string;
	isArchivePage: boolean;
	isReadRoute: boolean;
	isDownloadsRoute: boolean;
	isReadDetailRoute: boolean;
};

export type BookLayoutVersionDisplayState = {
	entries: BookVersionEntry[];
	hasVersions: boolean;
	resolvedVersion?: string;
	currentVersionIsLatest: boolean;
	badgeLabel: string | null;
	prefix: string;
	archivePath: string;
	showVersionHint: boolean;
};

export type BookLayoutLocaleDisplayState = {
	entries: LocaleEntry[];
	activeLocale?: string;
	defaultLocale: string;
	includeDefaultLocalePrefix: boolean;
	label: string;
};

export type BookLayoutRenderState = {
	pageTitle: string;
	lang: string;
	hasMermaid: boolean;
	metaDescription?: string;
	ogImage?: string;
	ogType: string;
	analyticsEndpoint?: string;
	version: BookLayoutVersionDisplayState;
	locale: BookLayoutLocaleDisplayState;
	routes: BookLayoutRouteState;
	preview: BookLayoutPreviewDisplayState;
	translationNotice: BookLayoutTranslationNoticeState;
	statusActions: {
		show: boolean;
	};
	head: LayoutMetadataState;
};

export type BookLayoutState = {
	seoProps: SeoProps;
	/**
	 * Whether request handlers exist (`site.runtime: "server"`). On a static
	 * deploy the analytics, feedback, and Q&A endpoints do not, so pages leave
	 * out the features that call them.
	 */
	hasServerRuntime: boolean;
	previewContext: PreviewAccessState | null;
	versionEntries: BookVersionEntry[];
	resolvedVersion?: string;
	resolvedLocales: LocaleEntry[];
	bookTitle: string;
	bookKey: string;
	aiQaEnabled: boolean;
	aiQaProvider?: import("../qa").AiQaProviderConfig;
	aiQaProviders?: import("../qa").AiQaProviderConfig[];
	currentLocale?: string;
	defaultLocale: string;
	includeDefaultLocalePrefix: boolean;
	localeLabel: string;
	renderState: BookLayoutRenderState;
};

export type CreateBookLayoutRenderStateOptions = {
	title?: string;
	hasMermaid?: boolean;
	bookTitle: string;
	author?: BookAuthor;
	bookVersion?: string;
	seoProps: SeoProps;
	requestPathname: string;
	analyticsEndpoint?: string;
	versionEntries: BookVersionEntry[];
	versionPrefix?: string;
	versionArchivePath?: string;
	versionArchiveNoindex?: boolean;
	locales: LocaleEntry[];
	currentLocale?: string;
	defaultLocale: string;
	includeDefaultLocalePrefix: boolean;
	localeLabel: string;
	showLocaleNotice?: boolean;
	isPreview: boolean;
	previewLabel?: string;
	previewTokenHint?: string;
	previewExpiresAt?: string;
};

export type BookLayoutOptions = {
	astro: BookLayoutAstroContext;
	bookConfig: BookLayoutConfig;
	versionEntries: BookVersionEntry[];
	localizedContentModules: Array<Record<string, BookLayoutContentModule>>;
	versionPrefix?: string;
};

const normalizePath = (pathname: string): string =>
	pathname.replace(/\/$/, "") || "/";

export const createBookLayoutRenderState = (
	options: CreateBookLayoutRenderStateOptions,
): BookLayoutRenderState => {
	const {
		title,
		hasMermaid = false,
		bookTitle,
		author,
		bookVersion,
		seoProps,
		requestPathname,
		analyticsEndpoint,
		versionEntries,
		versionPrefix = "v",
		versionArchivePath = "/versions",
		versionArchiveNoindex = true,
		locales,
		currentLocale,
		defaultLocale,
		includeDefaultLocalePrefix,
		localeLabel,
		showLocaleNotice = true,
		isPreview,
		previewLabel = "Preview",
		previewTokenHint,
		previewExpiresAt,
	} = options;

	const pageTitle = title ?? bookTitle;
	const normalizedRequestPathname = requestPathname || "/";
	const pathVersion = extractVersionFromPath(normalizedRequestPathname, {
		prefixSegment: versionPrefix,
	});
	const pathWithoutVersion = stripVersionFromPath(normalizedRequestPathname, {
		prefixSegment: versionPrefix,
	});
	const hasVersions = versionEntries.length > 0;
	const resolvedVersion = pathVersion ?? bookVersion;
	const currentVersionEntry =
		versionEntries.find((entry) => entry.version === resolvedVersion) ??
		versionEntries.find((entry) => entry.isLatest);
	const versionBadgeLabel = hasVersions
		? currentVersionEntry?.isLatest
			? "Latest"
			: resolvedVersion
				? `v${resolvedVersion}`
				: null
		: null;

	const localeCodes = locales.map((entry) => entry.code).filter(Boolean);
	const { defaultLocale: resolvedDefaultLocale } = resolveLocaleConfig(
		locales,
		{ defaultLocale },
	);
	const { locale: detectedLocale, pathWithoutLocale } = stripLocaleFromPath(
		pathWithoutVersion,
		localeCodes,
		{
			defaultLocale: resolvedDefaultLocale,
			includeDefaultPrefix: includeDefaultLocalePrefix,
		},
	);
	const activeLocale =
		currentLocale ?? detectedLocale ?? resolvedDefaultLocale ?? localeCodes[0];
	const activeLocaleEntry = locales.find(
		(entry) => entry.code === activeLocale,
	);
	const activeLocaleLabel = activeLocaleEntry?.label ?? activeLocale;
	const defaultLocaleLabel =
		locales.find((entry) => entry.code === resolvedDefaultLocale)?.label ??
		resolvedDefaultLocale;
	const localeCompletenessRaw =
		typeof activeLocaleEntry?.completeness === "number"
			? activeLocaleEntry.completeness
			: null;
	const localeCompleteness =
		localeCompletenessRaw === null
			? null
			: Math.min(1, Math.max(0, localeCompletenessRaw));
	const showTranslationNotice =
		showLocaleNotice && localeCompleteness !== null && localeCompleteness < 1;

	const normalizedPath = normalizePath(pathWithoutVersion);
	const normalizedLocalePath = normalizePath(
		pathWithoutLocale ?? pathWithoutVersion,
	);
	const normalizedArchivePath = normalizePath(versionArchivePath);
	const isArchivePage = normalizedLocalePath === normalizedArchivePath;
	const isReadRoute =
		normalizedLocalePath === "/read" ||
		normalizedLocalePath.startsWith("/read/");
	const isDownloadsRoute = normalizedLocalePath === "/downloads";
	const isReadDetailRoute = isReadRoute && normalizedLocalePath !== "/read";

	const previewExpiresLabel = previewExpiresAt
		? new Date(previewExpiresAt).toLocaleDateString(activeLocale ?? "en", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;
	const previewDetails = [
		previewTokenHint ? `Link ending in ${previewTokenHint}` : null,
		previewExpiresLabel ? `Expires ${previewExpiresLabel}` : null,
	].filter((value): value is string => Boolean(value));
	const showVersionHint = Boolean(
		hasVersions && !currentVersionEntry?.isLatest,
	);

	const head = computeLayoutMetadata({
		robots: seoProps.robots,
		pathVersion,
		currentVersionIsLatest: currentVersionEntry?.isLatest,
		versionArchiveNoindex,
		isArchivePage,
		ogTitle: seoProps.ogTitle,
		pageTitle,
		ogDescription: seoProps.ogDescription,
		metaDescription: seoProps.metaDescription,
		twitterCard: seoProps.twitterCard,
		twitterImage: seoProps.twitterImage,
		ogImage: seoProps.ogImage,
		twitterTitle: seoProps.twitterTitle,
		twitterDescription: seoProps.twitterDescription,
		ogSiteName: seoProps.ogSiteName,
		bookTitle,
		ogLocale: seoProps.ogLocale,
		activeLocale,
		ogImageAlt: seoProps.ogImageAlt,
		twitterImageAlt: seoProps.twitterImageAlt,
		resolvedCanonical: seoProps.canonicalUrl,
		structuredData: seoProps.structuredData,
		siteUrl: seoProps.siteUrl,
		author,
		localeEntries: locales,
		pathWithoutLocale,
		pathWithoutVersion,
		resolvedDefaultLocale,
		includeDefaultLocalePrefix,
	});

	return {
		pageTitle,
		lang: activeLocale ?? resolvedDefaultLocale ?? "en",
		hasMermaid,
		metaDescription: seoProps.metaDescription,
		ogImage: seoProps.ogImage,
		// Read detail pages are articles in a book; hubs and indexes are the site.
		ogType: seoProps.ogType ?? (isReadDetailRoute ? "article" : "website"),
		analyticsEndpoint,
		version: {
			entries: versionEntries,
			hasVersions,
			resolvedVersion,
			currentVersionIsLatest: Boolean(currentVersionEntry?.isLatest),
			badgeLabel: versionBadgeLabel,
			prefix: versionPrefix,
			archivePath: versionArchivePath,
			showVersionHint,
		},
		locale: {
			entries: locales,
			activeLocale,
			defaultLocale: resolvedDefaultLocale ?? defaultLocale,
			includeDefaultLocalePrefix,
			label: localeLabel,
		},
		routes: {
			requestPathname: normalizedRequestPathname,
			normalizedPath,
			normalizedLocalePath,
			pathWithoutLocale,
			pathWithoutVersion,
			isArchivePage,
			isReadRoute,
			isDownloadsRoute,
			isReadDetailRoute,
		},
		preview: {
			isPreview,
			label: previewLabel,
			tokenHint: previewTokenHint,
			expiresAt: previewExpiresAt,
			expiresLabel: previewExpiresLabel,
			details: previewDetails,
		},
		translationNotice: {
			show: showTranslationNotice,
			activeLocale,
			activeLocaleLabel,
			defaultLocale: resolvedDefaultLocale ?? defaultLocale,
			defaultLocaleLabel,
			completeness: localeCompleteness,
			percentage:
				localeCompleteness === null
					? null
					: Math.round(localeCompleteness * 100),
		},
		statusActions: {
			show: isPreview || showVersionHint,
		},
		head,
	};
};

export const createBookLayoutState = (
	options: BookLayoutOptions,
): BookLayoutState => {
	const {
		astro,
		bookConfig,
		versionEntries,
		localizedContentModules,
		versionPrefix = "v",
	} = options;
	const { props, locals, url } = astro;
	const originalUrl =
		typeof locals?.originalUrl === "string"
			? new URL(locals.originalUrl)
			: null;
	const requestUrl =
		typeof locals?.originalUrl === "string"
			? locals.originalUrl
			: url.toString();
	// Astro reports directory-format pages with a trailing slash; the host and
	// the sitemap serve them without one, so every derived URL drops it.
	const requestPathname = canonicalPathname(
		originalUrl?.pathname ?? url.pathname,
	);
	const previewContext = getPreviewContext(locals ?? {});
	const pathVersion = extractVersionFromPath(requestPathname, {
		prefixSegment: versionPrefix,
	});
	const latestVersion = versionEntries.find((entry) => entry.isLatest)?.version;
	const resolvedVersion =
		(locals?.bookVersion as string | undefined) ??
		pathVersion ??
		latestVersion ??
		bookConfig.status;
	const currentVersionEntry =
		versionEntries.find((entry) => entry.version === resolvedVersion) ??
		versionEntries.find((entry) => entry.isLatest);
	const canonicalPath =
		props.canonicalPath ??
		(pathVersion && !currentVersionEntry?.isLatest
			? stripVersionFromPath(requestPathname, { prefixSegment: versionPrefix })
			: requestPathname);
	const seoProps = buildSeoProps({
		site: bookConfig.site,
		requestUrl,
		description: props.description,
		ogTitle: props.ogTitle,
		ogDescription: props.ogDescription,
		ogImage: props.ogImage,
		ogType: props.ogType,
		twitterCard: props.twitterCard,
		twitterTitle: props.twitterTitle,
		twitterDescription: props.twitterDescription,
		twitterImage: props.twitterImage,
		ogSiteName: props.ogSiteName,
		ogLocale: props.ogLocale,
		ogImageAlt: props.ogImageAlt,
		twitterImageAlt: props.twitterImageAlt,
		structuredData: props.structuredData,
		robots: previewContext?.isPreview ? "noindex, nofollow" : props.robots,
		canonicalPath,
		canonicalUrl: props.canonicalUrl,
	});
	const defaultLocale = bookConfig.localization?.defaultLocale ?? "en";
	const localeIndexes = localizedContentModules.map((modules) =>
		buildLocalizedContentIndex(modules, { defaultLocale }),
	);
	const localeCompleteness = calculateLocaleCompleteness(localeIndexes, {
		locales:
			bookConfig.localization?.locales?.map((locale) => locale.code) ?? [],
	});
	const resolvedLocales = mergeLocaleCompleteness(
		bookConfig.localization?.locales ?? [],
		localeCompleteness,
	);
	const currentLocale = locals?.locale as string | undefined;
	const bookTitle = bookConfig.title;
	const bookKey = bookConfig.slug ?? "book";
	const hasServerRuntime = siteHasServerRuntime(bookConfig.site);
	// Without a server, Ask has no endpoint to call, and only the default
	// locale and latest version exist as built pages; locale and version paths
	// are rewritten per request.
	const aiQaEnabled = hasServerRuntime && (bookConfig.features?.aiQa ?? true);
	const reachableLocales = hasServerRuntime
		? resolvedLocales
		: resolvedLocales.filter((entry) => entry.code === defaultLocale);
	const reachableVersions = hasServerRuntime ? versionEntries : [];
	const aiQaProvider = bookConfig.features?.aiQaProvider;
	const aiQaProviders = bookConfig.features?.aiQaProviders;
	const includeDefaultLocalePrefix =
		bookConfig.localization?.includeDefaultPrefix ?? false;
	const localeLabel = bookConfig.localization?.label ?? "Language";

	return {
		seoProps,
		hasServerRuntime,
		previewContext,
		versionEntries,
		resolvedVersion,
		resolvedLocales,
		bookTitle,
		bookKey,
		aiQaEnabled,
		aiQaProvider,
		aiQaProviders,
		currentLocale,
		defaultLocale,
		includeDefaultLocalePrefix,
		localeLabel,
		renderState: createBookLayoutRenderState({
			title: props.title,
			hasMermaid: props.hasMermaid ?? false,
			bookTitle,
			author: bookConfig.author,
			bookVersion: resolvedVersion,
			seoProps,
			requestPathname,
			versionEntries: reachableVersions,
			versionPrefix,
			locales: reachableLocales,
			currentLocale,
			defaultLocale,
			includeDefaultLocalePrefix,
			localeLabel,
			isPreview: previewContext?.isPreview ?? false,
			previewLabel: previewContext?.label ?? "Preview",
			previewTokenHint: previewContext?.tokenHint,
			previewExpiresAt: previewContext?.expiresAt,
		}),
	};
};
