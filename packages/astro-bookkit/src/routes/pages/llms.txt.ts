import type { APIRoute } from "astro";
import { resolveBookSite } from "../../seo/config";
import { createLlmsTxt, llmsEntries } from "../../seo/llms";
import { bookConfig, bookEntryPoints } from "../runtime";

/** The book's index for language models (seo/llms.ts). */
export const GET: APIRoute = () => {
	const site = resolveBookSite(bookConfig);
	const txt = createLlmsTxt({
		title: bookConfig.title,
		description: bookConfig.site?.defaultMeta?.description,
		site,
		entries: llmsEntries(bookEntryPoints.contentRawModules, site),
	});
	return new Response(txt, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
