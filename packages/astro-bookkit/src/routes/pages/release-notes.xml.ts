import { createReleaseNotesRssEndpoint } from "../../releases/endpoint";
import { normalizeSiteUrl } from "../../seo/urls";
import { bookConfig, releaseModules } from "../runtime";

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
