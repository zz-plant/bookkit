import { buildLocalePath } from "../../localization/routes";
import {
	isGeneratedOgImage,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
} from "../../seo/og-image";
import { shortBookTitle } from "../../seo/page-meta";
import {
	type BookAuthor,
	createAuthorStructuredData,
} from "../../seo/structured-data";

export type { BookAuthor };

type LocaleEntry = { code: string };

export type LayoutMetadataState = {
	resolvedCanonical?: string;
	resolvedRobots?: string;
	resolvedOgTitle?: string;
	resolvedOgDescription?: string;
	resolvedTwitterCard?: string;
	resolvedTwitterTitle?: string;
	resolvedTwitterDescription?: string;
	resolvedTwitterImage?: string;
	resolvedOgSiteName?: string;
	resolvedOgLocale?: string;
	resolvedOgImageAlt?: string;
	resolvedTwitterImageAlt?: string;
	/** Set for Bookkit's generated previews, whose size is known. */
	ogImageSize?: { width: number; height: number };
	author?: string;
	structuredDataScripts: unknown[];
	hreflangEntries: Array<{
		locale: string;
		href: string;
	}>;
	hreflangDefault: string | null;
};

export const computeLayoutMetadata = ({
	robots,
	pathVersion,
	currentVersionIsLatest,
	versionArchiveNoindex,
	isArchivePage,
	ogTitle,
	pageTitle,
	ogDescription,
	metaDescription,
	twitterCard,
	twitterImage,
	ogImage,
	twitterTitle,
	twitterDescription,
	ogSiteName,
	bookTitle,
	ogLocale,
	activeLocale,
	ogImageAlt,
	twitterImageAlt,
	resolvedCanonical,
	structuredData,
	siteUrl,
	author,
	localeEntries,
	pathWithoutLocale,
	pathWithoutVersion,
	resolvedDefaultLocale,
	includeDefaultLocalePrefix,
}: {
	robots?: string;
	pathVersion?: string | null;
	currentVersionIsLatest?: boolean;
	versionArchiveNoindex: boolean;
	isArchivePage: boolean;
	ogTitle?: string;
	pageTitle: string;
	ogDescription?: string;
	metaDescription?: string;
	twitterCard?: string;
	twitterImage?: string;
	ogImage?: string;
	twitterTitle?: string;
	twitterDescription?: string;
	ogSiteName?: string;
	bookTitle: string;
	ogLocale?: string;
	activeLocale?: string;
	ogImageAlt?: string;
	twitterImageAlt?: string;
	resolvedCanonical?: string;
	structuredData?: unknown;
	siteUrl?: string;
	author?: BookAuthor;
	localeEntries: LocaleEntry[];
	pathWithoutLocale?: string;
	pathWithoutVersion: string;
	resolvedDefaultLocale?: string;
	includeDefaultLocalePrefix: boolean;
}): LayoutMetadataState => {
	const resolvedRobots =
		robots ??
		((pathVersion && !currentVersionIsLatest) ||
		(versionArchiveNoindex && isArchivePage)
			? "noindex, nofollow"
			: undefined);
	const resolvedOgTitle = ogTitle ?? pageTitle;
	const resolvedOgDescription = ogDescription ?? metaDescription;
	const resolvedTwitterCard =
		twitterCard ??
		(twitterImage || ogImage ? "summary_large_image" : "summary");
	const resolvedTwitterTitle = twitterTitle ?? resolvedOgTitle;
	const resolvedTwitterDescription =
		twitterDescription ?? resolvedOgDescription;
	const resolvedTwitterImage = twitterImage ?? ogImage;
	const resolvedOgSiteName = ogSiteName ?? shortBookTitle(bookTitle);
	const resolvedOgLocale = ogLocale ?? activeLocale;
	const generatedImage = isGeneratedOgImage(ogImage);
	// A generated preview shows the page's title, so the title is its alt text.
	const resolvedOgImageAlt =
		ogImageAlt ?? (generatedImage ? resolvedOgTitle : undefined);
	const resolvedTwitterImageAlt = twitterImageAlt ?? resolvedOgImageAlt;
	const authorData = createAuthorStructuredData(author);

	const defaultStructuredData = [
		resolvedCanonical
			? {
					"@context": "https://schema.org",
					"@type": "WebPage",
					name: pageTitle,
					description: metaDescription,
					url: resolvedCanonical,
					inLanguage: activeLocale,
					author: authorData,
					isPartOf: siteUrl
						? {
								"@type": "WebSite",
								name: bookTitle,
								url: siteUrl,
								author: authorData,
							}
						: undefined,
				}
			: null,
	].filter(Boolean);
	const customStructuredData = Array.isArray(structuredData)
		? structuredData
		: structuredData
			? [structuredData]
			: [];
	const structuredDataScripts = [
		...defaultStructuredData,
		...customStructuredData,
	];

	// Alternates only mean something when another language exists.
	const hasAlternates = Boolean(siteUrl) && localeEntries.length > 1;
	const hreflangEntries =
		siteUrl && hasAlternates
			? localeEntries.map((entry) => ({
					locale: entry.code,
					href: new URL(
						buildLocalePath(
							pathWithoutLocale ?? pathWithoutVersion,
							entry.code,
							{
								defaultLocale: resolvedDefaultLocale,
								includeDefaultPrefix: includeDefaultLocalePrefix,
							},
						),
						siteUrl,
					).toString(),
				}))
			: [];

	const hreflangDefault =
		siteUrl && hasAlternates && resolvedDefaultLocale
			? new URL(
					buildLocalePath(
						pathWithoutLocale ?? pathWithoutVersion,
						resolvedDefaultLocale,
						{
							defaultLocale: resolvedDefaultLocale,
							includeDefaultPrefix: includeDefaultLocalePrefix,
						},
					),
					siteUrl,
				).toString()
			: null;

	return {
		resolvedCanonical,
		resolvedRobots,
		resolvedOgTitle,
		resolvedOgDescription,
		resolvedTwitterCard,
		resolvedTwitterTitle,
		resolvedTwitterDescription,
		resolvedTwitterImage,
		resolvedOgSiteName,
		resolvedOgLocale,
		resolvedOgImageAlt,
		resolvedTwitterImageAlt,
		ogImageSize: generatedImage
			? { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
			: undefined,
		author: author?.name,
		structuredDataScripts,
		hreflangEntries,
		hreflangDefault,
	};
};
