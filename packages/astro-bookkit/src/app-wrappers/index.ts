import type { APIRoute } from "astro";
import { createReaderAnalyticsEndpoint } from "../analytics";
import type { ExportBundle } from "../exports";
import {
	createExportAnalyticsEndpoint,
	createExportResponse,
} from "../exports";
import { createFeedbackEndpoint } from "../feedback/endpoint";
import { createPreviewAnalyticsEndpoint } from "../preview";
import { createQaApiHandlers as createQaEndpoint } from "../qa";
import { recordReleaseEvent } from "../releases/analytics";
import { createReleaseWebhookEndpoint } from "../releases/endpoint";
import type { ReleaseModule, ReleaseNote } from "../releases/notes";
import type { BookVersionEntry } from "../releases/versions";
import {
	createBookSearchIndexEndpoint,
	createLocalizedSearchIndexEndpoint,
} from "../search/endpoint";
import type { BookSearchModuleMap } from "../search/sources";
import type {
	BookSitemapContentModules,
	BookSitemapOptions,
} from "../seo/book";
import { createBookSitemapEntries } from "../seo/book";
import type { BookSeoConfig } from "../seo/config";
import { buildSeoProps, runtimeFeatures } from "../seo/config";
import { createSitemapXml } from "../seo/sitemap";
import type { BookAuthor } from "../seo/structured-data";

export const createAnalyticsApiHandlers = () => createReaderAnalyticsEndpoint();
export const createFeedbackApiHandlers = () => createFeedbackEndpoint();
export const createExportAnalyticsApiHandlers = () =>
	createExportAnalyticsEndpoint();
export const createPreviewAnalyticsApiHandlers = () =>
	createPreviewAnalyticsEndpoint();

export const createReleaseWebhookApiHandlers = (options: {
	modules: Record<string, ReleaseModule>;
	book: { slug: string; title: string };
}) => createReleaseWebhookEndpoint(options);

export const createQaApiHandlers = (options: {
	provider?: import("../qa").AiQaProviderConfig;
	providers?: import("../qa").AiQaProviderConfig[];
}) => createQaEndpoint(options);

export const createReleaseAnalyticsApiPostHandler =
	(): APIRoute =>
	async ({ request }) => {
		try {
			const payload = await request.json();
			if (payload?.event === "rss_subscribe_click") {
				await recordReleaseEvent({ event: "rss_subscribe_click" });
			}
		} catch (error) {
			console.warn("Release analytics parse error", error);
		}

		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	};

export const createSearchIndexGetHandler = (options: {
	modules: BookSearchModuleMap;
	defaultLocale?: string;
}): APIRoute => {
	const defaultEndpoint = createBookSearchIndexEndpoint(options.modules);
	const localizedEndpoint = createLocalizedSearchIndexEndpoint(
		options.modules,
		{
			defaultLocale: options.defaultLocale ?? "en",
		},
	);

	return (context) => {
		const url = new URL(context.request.url);
		if (url.searchParams.has("locale")) {
			return localizedEndpoint.GET(context);
		}
		return defaultEndpoint.GET();
	};
};

export const createSitemapGetHandler =
	(options: {
		site: BookSeoConfig;
		content: BookSitemapContentModules;
		contentRaw?: BookSitemapOptions["contentRaw"];
		defaultLastmod?: string;
		defaultLocale?: string;
	}): APIRoute =>
	() => {
		const entries = createBookSitemapEntries({
			site: options.site,
			content: options.content,
			contentRaw: options.contentRaw,
			defaultLastmod: options.defaultLastmod,
			defaultLocale: options.defaultLocale,
		});

		return new Response(createSitemapXml(entries), {
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
			},
		});
	};

export const createBookExportGetHandler =
	(options: {
		getBookExportBundle: () => ExportBundle;
		format: "pdf" | "epub";
		filename: string;
	}) =>
	async () =>
		createExportResponse(
			options.getBookExportBundle(),
			options.format,
			options.filename,
		);

export const createChapterExportHandlers = (options: {
	chapterExportSlugs: readonly string[];
	getChapterExportBundle: (slug: string) => ExportBundle | null;
	format: "pdf" | "epub";
	filenamePrefix: string;
}) => ({
	getStaticPaths: () =>
		options.chapterExportSlugs.map((slug) => ({
			params: { slug },
		})),
	GET: async ({ params }: { params: { slug?: string } }) => {
		const slug = params.slug ?? "";
		const bundle = options.getChapterExportBundle(slug);
		if (!bundle) {
			return new Response("Not found", { status: 404 });
		}
		return createExportResponse(
			bundle,
			options.format,
			`${options.filenamePrefix}-${slug}.${options.format}`,
		);
	},
});

export const buildVersionArchivePageProps = (options: {
	book: {
		title: string;
		status: string;
		slug?: string;
		site?: BookSeoConfig;
		author?: BookAuthor;
		features?: { aiQa?: boolean };
	};
	versionEntries: BookVersionEntry[];
	requestUrl: string;
	ogImage: string;
	description?: string;
}) => {
	const latestVersion =
		options.versionEntries.find((entry) => entry.isLatest)?.version ??
		options.book.status;
	const seoProps = buildSeoProps({
		site: options.book.site,
		requestUrl: options.requestUrl,
		ogImage: options.ogImage,
		description:
			options.description ??
			"Browse current and archived versions of the book.",
	});

	return {
		title: `Version archive • ${options.book.title}`,
		bookTitle: options.book.title,
		author: options.book.author,
		bookVersion: latestVersion,
		bookKey: options.book.slug ?? "book",
		versions: options.versionEntries,
		description: seoProps.metaDescription,
		...runtimeFeatures(options.book),
		...seoProps,
	};
};

export const buildReleaseNotesPageProps = (options: {
	book: {
		title: string;
		status: string;
		slug?: string;
		site?: BookSeoConfig;
		author?: BookAuthor;
		features?: { aiQa?: boolean };
	};
	releases: ReleaseNote[];
	versionEntries: BookVersionEntry[];
	requestUrl: string;
	ogImage: string;
	rssUrl?: string;
	subscribeAnalyticsUrl?: string;
	description?: string;
}) => {
	const latestVersion =
		options.versionEntries.find((entry) => entry.isLatest)?.version ??
		options.book.status;
	const seoProps = buildSeoProps({
		site: options.book.site,
		requestUrl: options.requestUrl,
		ogImage: options.ogImage,
		description:
			options.description ??
			"What changed in each version of the book, newest first.",
	});

	return {
		title: `Release notes • ${options.book.title}`,
		bookTitle: options.book.title,
		author: options.book.author,
		bookVersion: latestVersion,
		bookKey: options.book.slug ?? "book",
		rssUrl: options.rssUrl ?? "/release-notes.xml",
		releases: options.releases,
		versions: options.versionEntries,
		description: seoProps.metaDescription,
		subscribeLabel: "RSS feed",
		subscribeAnalyticsUrl:
			options.subscribeAnalyticsUrl ?? "/api/release-analytics.json",
		...runtimeFeatures(options.book),
		...seoProps,
	};
};
