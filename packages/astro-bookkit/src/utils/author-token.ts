import { jsonResponse } from "./http";

/**
 * Endpoints meant for the author and their CI rather than for readers: sending
 * a release's webhooks and email, reading what readers sent (analytics,
 * feedback, preview visits), and MCP tool calls, which run commands. With
 * `site.runtime: "server"` they are on the public internet, so each answers
 * only a request that carries this token as `Authorization: Bearer <token>`.
 */
export const AUTHOR_TOKEN_ENV = "BOOKKIT_AUTHOR_TOKEN";

/** Shorter tokens are refused as unset: they can be guessed. */
export const MIN_AUTHOR_TOKEN_LENGTH = 32;

export type AuthorTokenOptions = {
	/** Names the endpoint in the server log, e.g. "POST /api/release-email.json". */
	route: string;
	/**
	 * Let requests through under `astro dev` (`bookkit dev`), where the server
	 * listens on this machine only. Endpoints that send anything out stay closed
	 * there too.
	 */
	openInDev?: boolean;
	/** Whether this is the dev server; tests replace it. */
	isDev?: () => boolean;
};

export type AuthorTokenCheck =
	| { ok: true }
	| { ok: false; status: 401 | 500; error: string };

/** Vite sets this to true under `astro dev` and to false in a build. */
export const isDevServer = (): boolean => import.meta.env?.DEV === true;

const configuredToken = (): string =>
	typeof process === "undefined"
		? ""
		: (process.env[AUTHOR_TOKEN_ENV] ?? "").trim();

const sha256 = async (value: string): Promise<Uint8Array> =>
	new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
	);

/**
 * Compares the SHA-256 digests of both values byte by byte without stopping
 * early, so the time taken depends on neither token nor its length.
 */
export const tokensMatch = async (
	presented: string,
	expected: string,
): Promise<boolean> => {
	const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
	let difference = 0;
	for (let index = 0; index < a.length; index += 1) {
		difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
	}
	return difference === 0;
};

const bearerToken = (request: Request): string | null => {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(
		request.headers.get("authorization") ?? "",
	);
	return match?.[1] ?? null;
};

/**
 * Whether the request carries the author token. When the server has no usable
 * token configured, the reason goes to the server log and the caller gets a
 * 500 that does not say what is missing.
 */
export const checkAuthorToken = async (
	request: Request,
	{ route, openInDev = false, isDev = isDevServer }: AuthorTokenOptions,
): Promise<AuthorTokenCheck> => {
	if (openInDev && isDev()) return { ok: true };

	const expected = configuredToken();
	if (expected.length < MIN_AUTHOR_TOKEN_LENGTH) {
		console.error(
			expected
				? `[bookkit] ${route} refused a request: ${AUTHOR_TOKEN_ENV} is ${expected.length} characters long and must be at least ${MIN_AUTHOR_TOKEN_LENGTH}. Generate one with: openssl rand -hex 32`
				: `[bookkit] ${route} refused a request: ${AUTHOR_TOKEN_ENV} is not set in the server's environment. Set it to a random value of at least ${MIN_AUTHOR_TOKEN_LENGTH} characters (openssl rand -hex 32) and send it as Authorization: Bearer <token>.`,
		);
		return {
			ok: false,
			status: 500,
			error: "This endpoint is not configured on this server.",
		};
	}

	const presented = bearerToken(request);
	if (!presented || !(await tokensMatch(presented, expected))) {
		return {
			ok: false,
			status: 401,
			error:
				"Unauthorized: send the author token as Authorization: Bearer <token>.",
		};
	}
	return { ok: true };
};

export const authorTokenRefusal = (
	check: Extract<AuthorTokenCheck, { ok: false }>,
): Response =>
	jsonResponse(
		{ ok: false, error: check.error },
		check.status,
		check.status === 401
			? { "WWW-Authenticate": 'Bearer realm="bookkit"' }
			: {},
	);

/** Runs `handler` only for a request that carries the author token. */
export const authorOnly =
	<C extends { request: Request }>(
		handler: (context: C) => Response | Promise<Response>,
		options: AuthorTokenOptions,
	) =>
	async (context: C): Promise<Response> => {
		const check = await checkAuthorToken(context.request, options);
		return check.ok ? handler(context) : authorTokenRefusal(check);
	};
