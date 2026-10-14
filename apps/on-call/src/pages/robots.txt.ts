import { createBookRobotsTxt, resolveBookSite } from "@bookkit/astro-bookkit";
import type { APIRoute } from "astro";
import bookConfig from "../book.config";

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
