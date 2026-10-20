import type { APIRoute } from "astro";

const JSON_RESPONSE_HEADERS = {
	"Content-Type": "application/json; charset=utf-8",
};

export type JsonParseResult =
	| { ok: true; value: unknown }
	| { ok: false; error: string; tooLarge?: true };

export const jsonResponse = (
	payload: unknown,
	status = 200,
	headers: Record<string, string> = {},
) => {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { ...JSON_RESPONSE_HEADERS, ...headers },
	});
};

/**
 * The body as text, or null when it is longer than `maxBytes`. A declared
 * Content-Length over the limit is refused before reading; a body sent without
 * one is read only up to the limit.
 */
const readBodyText = async (
	request: Request,
	maxBytes?: number,
): Promise<string | null> => {
	if (maxBytes === undefined) return request.text();
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
};

export const tryParseJsonBody = async (
	request: Request,
	options: { maxBytes?: number } = {},
): Promise<JsonParseResult> => {
	try {
		const text = await readBodyText(request, options.maxBytes);
		if (text === null)
			return {
				ok: false,
				tooLarge: true,
				error: `the request body is larger than ${options.maxBytes} bytes`,
			};
		return { ok: true, value: JSON.parse(text) };
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

/** 413 for a body over the limit, 400 for one that is not JSON. */
export const invalidBodyResponse = (
	parsed: Extract<JsonParseResult, { ok: false }>,
) =>
	parsed.tooLarge
		? jsonResponse(
				{ ok: false, error: `Payload too large: ${parsed.error}.` },
				413,
			)
		: jsonResponse(
				{ ok: false, error: "Invalid payload: the body is not JSON." },
				400,
			);

export type RateLimit = {
	/** Requests allowed per window. */
	limit: number;
	/** Window length; default one minute. */
	windowMs?: number;
};

export type RateLimiter = {
	/** Counts one request for `key`: null when allowed, else seconds until the window resets. */
	take: (key: string, now?: number) => number | null;
};

const MAX_TRACKED_KEYS = 10_000;

/**
 * A fixed-window counter held in this server process's memory. On a
 * long-running server (the Node adapter) it limits each client; where requests
 * spread over many short-lived instances it limits each instance, which still
 * bounds a burst.
 */
export const createRateLimiter = ({
	limit,
	windowMs = 60_000,
}: RateLimit): RateLimiter => {
	const windows = new Map<string, { start: number; count: number }>();
	const evict = (now: number) => {
		for (const [key, window] of windows) {
			if (now - window.start >= windowMs) windows.delete(key);
		}
		while (windows.size >= MAX_TRACKED_KEYS) {
			const oldest = windows.keys().next().value;
			if (oldest === undefined) break;
			windows.delete(oldest);
		}
	};
	return {
		take: (key, now = Date.now()) => {
			let window = windows.get(key);
			if (!window || now - window.start >= windowMs) {
				if (!window && windows.size >= MAX_TRACKED_KEYS) evict(now);
				window = { start: now, count: 0 };
				windows.set(key, window);
			}
			if (window.count >= limit)
				return Math.max(1, Math.ceil((window.start + windowMs - now) / 1000));
			window.count += 1;
			return null;
		},
	};
};

/**
 * The client's address as the adapter reports it, or null where the runtime
 * does not provide one (Astro throws on `clientAddress` then).
 */
export const clientAddressOf = (context: {
	clientAddress?: string;
}): string | null => {
	try {
		const address = context.clientAddress;
		return typeof address === "string" && address ? address : null;
	} catch {
		return null;
	}
};

export const tooManyRequestsResponse = (retryAfterSeconds: number) =>
	jsonResponse(
		{
			ok: false,
			error: `Too many requests. Retry in ${retryAfterSeconds} s.`,
		},
		429,
		{ "Retry-After": String(retryAfterSeconds) },
	);

type ReaderContext = { request: Request; clientAddress?: string };

/**
 * Limits a reader-facing handler: `perClient` requests per window from one
 * client address (skipped where the runtime reports none), and optionally
 * `overall` requests per window from everyone, for a handler that spends money
 * on each call.
 */
export const rateLimited = <C extends ReaderContext>(
	handler: (context: C) => Response | Promise<Response>,
	limits: { perClient: RateLimit; overall?: RateLimit },
): ((context: C) => Promise<Response>) => {
	const perClient = createRateLimiter(limits.perClient);
	const overall = limits.overall ? createRateLimiter(limits.overall) : null;
	return async (context) => {
		const address = clientAddressOf(context);
		const clientWait = address ? perClient.take(address) : null;
		if (clientWait !== null) return tooManyRequestsResponse(clientWait);
		const overallWait = overall ? overall.take("*") : null;
		if (overallWait !== null) return tooManyRequestsResponse(overallWait);
		return handler(context);
	};
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
