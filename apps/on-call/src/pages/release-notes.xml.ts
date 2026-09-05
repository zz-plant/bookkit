import {
	createReleaseNotesRssEndpoint,
	normalizeSiteUrl,
} from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { releaseModules } from "../lib/release-notes";

const siteUrl =
	(bookConfig.site?.url
		? normalizeSiteUrl(bookConfig.site.url, bookConfig.site.enforceHttps)
		: null) ??
	(import.meta.env.SITE_URL || "http://localhost:4321");

export const { GET } = createReleaseNotesRssEndpoint({
	modules: releaseModules,
	siteUrl,
	bookTitle: bookConfig.title,
});
