import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import {
	AUTHOR_TOKEN_ENV,
	authorOnly,
	checkAuthorToken,
	tokensMatch,
} from "./author-token";
import { jsonResponse } from "./http";

const TOKEN = "a".repeat(32);
const request = (authorization?: string) =>
	new Request("https://book.example/api/release-email.json", {
		method: "POST",
		headers: authorization ? { authorization } : {},
	});
const options = { route: "POST /api/release-email.json" };

describe("checkAuthorToken", () => {
	let saved: string | undefined;
	let logged: ReturnType<typeof spyOn>;

	beforeEach(() => {
		saved = process.env[AUTHOR_TOKEN_ENV];
		logged = spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		if (saved === undefined) delete process.env[AUTHOR_TOKEN_ENV];
		else process.env[AUTHOR_TOKEN_ENV] = saved;
		logged.mockRestore();
	});

	it("refuses every request with 500 when no token is configured, and logs how to set one", async () => {
		delete process.env[AUTHOR_TOKEN_ENV];
		const check = await checkAuthorToken(request(`Bearer ${TOKEN}`), options);

		expect(check).toEqual({
			ok: false,
			status: 500,
			error: "This endpoint is not configured on this server.",
		});
		const message = String(logged.mock.calls[0]?.[0]);
		expect(message).toContain("POST /api/release-email.json");
		expect(message).toContain("BOOKKIT_AUTHOR_TOKEN is not set");
		expect(message).toContain("Authorization: Bearer <token>");
	});

	it("treats a token shorter than 32 characters as unset", async () => {
		process.env[AUTHOR_TOKEN_ENV] = "short";
		const check = await checkAuthorToken(request("Bearer short"), options);

		expect(check.ok).toBe(false);
		expect(check.ok ? 0 : check.status).toBe(500);
		expect(String(logged.mock.calls[0]?.[0])).toContain(
			"5 characters long and must be at least 32",
		);
	});

	it("refuses a missing, malformed, or wrong token with 401", async () => {
		process.env[AUTHOR_TOKEN_ENV] = TOKEN;
		for (const header of [
			undefined,
			TOKEN,
			`Basic ${TOKEN}`,
			"Bearer",
			`Bearer ${TOKEN} extra`,
			`Bearer ${"b".repeat(32)}`,
			`Bearer ${TOKEN.slice(1)}`,
			`Bearer ${TOKEN}${"a".repeat(100_000)}`,
		]) {
			const check = await checkAuthorToken(request(header), options);
			expect(check.ok ? 200 : check.status).toBe(401);
		}
		expect(logged).not.toHaveBeenCalled();
	});

	it("accepts the configured token, ignoring surrounding whitespace in the variable", async () => {
		process.env[AUTHOR_TOKEN_ENV] = ` ${TOKEN}\n`;
		expect(await checkAuthorToken(request(`Bearer ${TOKEN}`), options)).toEqual(
			{ ok: true },
		);
		expect(
			await checkAuthorToken(request(`bearer   ${TOKEN}`), options),
		).toEqual({ ok: true });
	});

	it("opens only endpoints marked openInDev under astro dev", async () => {
		delete process.env[AUTHOR_TOKEN_ENV];
		const isDev = () => true;

		expect(
			await checkAuthorToken(request(), { ...options, openInDev: true, isDev }),
		).toEqual({ ok: true });
		expect((await checkAuthorToken(request(), { ...options, isDev })).ok).toBe(
			false,
		);
		expect(
			(
				await checkAuthorToken(request(), {
					...options,
					openInDev: true,
					isDev: () => false,
				})
			).ok,
		).toBe(false);
	});
});

describe("authorOnly", () => {
	let saved: string | undefined;

	beforeEach(() => {
		saved = process.env[AUTHOR_TOKEN_ENV];
		process.env[AUTHOR_TOKEN_ENV] = TOKEN;
	});
	afterEach(() => {
		if (saved === undefined) delete process.env[AUTHOR_TOKEN_ENV];
		else process.env[AUTHOR_TOKEN_ENV] = saved;
	});

	it("runs the handler only for the author", async () => {
		let runs = 0;
		const route = authorOnly(() => {
			runs += 1;
			return jsonResponse({ ok: true });
		}, options);

		const refused = await route({ request: request("Bearer wrong") });
		expect(refused.status).toBe(401);
		expect(refused.headers.get("www-authenticate")).toBe(
			'Bearer realm="bookkit"',
		);
		expect(await refused.json()).toEqual({
			ok: false,
			error:
				"Unauthorized: send the author token as Authorization: Bearer <token>.",
		});
		expect(runs).toBe(0);

		const allowed = await route({ request: request(`Bearer ${TOKEN}`) });
		expect(allowed.status).toBe(200);
		expect(runs).toBe(1);
	});
});

describe("tokensMatch", () => {
	it("matches equal strings only, whatever their lengths", async () => {
		expect(await tokensMatch(TOKEN, TOKEN)).toBe(true);
		expect(await tokensMatch(TOKEN, `${TOKEN}a`)).toBe(false);
		expect(await tokensMatch("", TOKEN)).toBe(false);
	});
});
