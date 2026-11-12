import type { APIRoute, GetStaticPaths } from "astro";
import { resolveBookSite } from "../../../seo/config";
import { llmsEntries, markdownCopyPath } from "../../../seo/llms";
import { bookConfig, bookEntryPoints } from "../../runtime";

/**
 * `/md/<section>/<slug>.md`: an entry's Markdown copy, as /llms.txt links it
 * (seo/llms.ts). One rest route, because Astro strips a `.md` ending from a
 * route's own pattern. A book that is not indexable, or a stub chapter, has
 * no copy, as it has no place in /llms.txt.
 */
const copies = () => {
	const site = resolveBookSite(bookConfig);
	if (site.indexable === false) return [];
	return llmsEntries(bookEntryPoints.contentRawModules, site).map((entry) => ({
		path: markdownCopyPath(entry).replace(/^\/md\//, ""),
		markdown: entry.markdown,
	}));
};

export const getStaticPaths: GetStaticPaths = () =>
	copies().map(({ path }) => ({ params: { path } }));

export const GET: APIRoute = ({ params }) => {
	const copy = copies().find((each) => each.path === params.path);
	if (!copy) return new Response("Not found\n", { status: 404 });
	return new Response(copy.markdown, {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
};
