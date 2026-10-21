import type { APIRoute } from "astro";
import { createBookRobotsTxt } from "../../seo/book";
import { resolveBookSite } from "../../seo/config";
import { bookConfig } from "../runtime";

export const GET: APIRoute = () => {
	const txt = createBookRobotsTxt({
		site: resolveBookSite(bookConfig),
	});

	return new Response(txt, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
