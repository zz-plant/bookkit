import type { APIRoute } from "astro";

const JSON_RESPONSE_HEADERS = {
	"Content-Type": "application/json; charset=utf-8",
};

export type JsonParseResult =
	| { ok: true; value: unknown }
	| { ok: false; error: string };

export const jsonResponse = (payload: unknown, status = 200) => {
	return new Response(JSON.stringify(payload), {
		status,
		headers: JSON_RESPONSE_HEADERS,
	});
};

export const tryParseJsonBody = async (
	request: Request,
): Promise<JsonParseResult> => {
	try {
		return {
			ok: true,
			value: await request.json(),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

export const parseJsonBody = async (
	request: Request,
): Promise<unknown | null> => {
	const parsed = await tryParseJsonBody(request);
	if (!parsed.ok) return null;
	return parsed.value;
};

type RouteHandlers = { GET?: APIRoute; POST?: APIRoute };

/**
 * The handlers of an API route that only works with a request handler behind
 * it (everything under `/api/` except the MCP discovery manifest).
 *
 * A static build prerenders each route by calling GET once. Every GET here
 * answers that prerender with no body, so the build writes no file: a POST-only
 * route would otherwise come out as the 404 page saved under a `.json` name,
 * and a GET that reads what readers sent (analytics, feedback) would publish
 * the build machine's local log. On demand, a route without a GET answers GET
 * with 405 and the methods it does accept.
 */
export const requestHandlers = <H extends RouteHandlers>(
	handlers: H,
): H & { GET: APIRoute } => {
	const allow = Object.keys(handlers).join(", ");
	const read = handlers.GET;
	return {
		...handlers,
		GET: (context) => {
			if (context.isPrerendered) return new Response(null, { status: 404 });
			if (read) return read(context);
			return new Response(null, { status: 405, headers: { Allow: allow } });
		},
	};
};
