import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { APIContext } from "astro";

import { createBookRuntime } from "../../book/runtime";
import {
	type AuthorReadState,
	authorAccessView,
	authorTokenKey,
	fetchAuthorJson,
	forgetAuthorToken,
	readAuthorToken,
	saveAuthorToken,
	type TokenStorage,
} from "./access";

const TOKEN = "k".repeat(40);

const memoryStorage = (): TokenStorage & { data: Map<string, string> } => {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value);
		},
		removeItem: (key) => {
			data.delete(key);
		},
	};
};

const blockedStorage: TokenStorage = {
	getItem: () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
	setItem: () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
	removeItem: () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
};

describe("the stored author token", () => {
	it("is kept per book, trimmed, and can be forgotten", () => {
		const storage = memoryStorage();
		expect(readAuthorToken(storage, "on-call")).toBeNull();
		expect(saveAuthorToken(storage, "on-call", `  ${TOKEN}\n`)).toBe(true);
		expect(storage.data.get(authorTokenKey("on-call"))).toBe(TOKEN);
		expect(readAuthorToken(storage, "on-call")).toBe(TOKEN);
		expect(readAuthorToken(storage, "running-hot")).toBeNull();

		forgetAuthorToken(storage, "on-call");
		expect(readAuthorToken(storage, "on-call")).toBeNull();
	});

	it("is not saved when empty", () => {
		const storage = memoryStorage();
		expect(saveAuthorToken(storage, "on-call", "   ")).toBe(false);
		expect(storage.data.size).toBe(0);
	});

	it("reads as none, and says it was not saved, when the browser blocks storage", () => {
		expect(readAuthorToken(blockedStorage, "on-call")).toBeNull();
		expect(saveAuthorToken(blockedStorage, "on-call", TOKEN)).toBe(false);
		expect(() => forgetAuthorToken(blockedStorage, "on-call")).not.toThrow();
	});
});

describe("fetchAuthorJson", () => {
	const answering = (response: () => Response) => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			requests.push({ url, headers: new Headers(init?.headers) });
			return response();
		}) as unknown as typeof fetch;
		return { requests, fetchImpl };
	};
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});

	it("sends the token as a Bearer header, never in the URL", async () => {
		const { requests, fetchImpl } = answering(() => json({ events: [] }));
		const url = "https://book.example/api/feedback.json?since=1";
		await fetchAuthorJson(url, { token: TOKEN, fetchImpl });
		expect(requests[0].url).toBe(url);
		expect(requests[0].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
		expect(requests[0].headers.get("accept")).toBe("application/json");
	});

	it("sends no Authorization header without a token", async () => {
		const { requests, fetchImpl } = answering(() => json({ events: [] }));
		await fetchAuthorJson("/api/analytics.json", { token: null, fetchImpl });
		expect(requests[0].headers.has("authorization")).toBe(false);
	});

	it("names each answer", async () => {
		const cases: Array<[string, () => Response, string | null, string]> = [
			["data", () => json({ events: [1] }), TOKEN, "ok"],
			["401 without a token", () => json({}, 401), null, "needs-token"],
			["401 with a token", () => json({}, 401), TOKEN, "token-refused"],
			[
				"500 from a server with no token",
				() =>
					json(
						{
							ok: false,
							error: "This endpoint is not configured on this server.",
						},
						500,
					),
				TOKEN,
				"not-configured",
			],
			[
				"any other 500",
				() => json({ error: "boom" }, 500),
				null,
				"unavailable",
			],
			[
				"a static site's 404",
				() => new Response("Not found", { status: 404 }),
				null,
				"unavailable",
			],
			[
				"a body that is not JSON",
				() => new Response("<html>", { status: 200 }),
				null,
				"unavailable",
			],
		];
		for (const [label, response, token, state] of cases) {
			const { fetchImpl } = answering(response);
			const read = await fetchAuthorJson("/api/analytics.json", {
				token,
				fetchImpl,
			});
			expect({ label, state: read.state }).toEqual({ label, state });
		}

		const failing = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(
			(
				await fetchAuthorJson("/api/analytics.json", {
					token: null,
					fetchImpl: failing,
				})
			).state,
		).toBe("unavailable");
	});
});

describe("fetchAuthorJson against the read endpoints of a server deployment", () => {
	const api = createBookRuntime({
		bookConfig: { slug: "fixture", title: "Fixture" },
		modules: {
			contentModules: {
				chapters: {},
				mechanisms: {},
				toolkit: {},
				glossary: {},
				examples: {},
			},
			contentRawModules: {
				chapters: {},
				mechanisms: {},
				toolkit: {},
				glossary: {},
				examples: {},
			},
			releaseModules: {},
		},
	}).api;
	const routes = {
		"/api/analytics.json": api.analytics,
		"/api/feedback.json": api.feedback,
		"/api/preview-analytics.json": api.previewAnalytics,
	};
	// The browser's fetch, answered by the route the URL names.
	const server = (async (url: string, init?: RequestInit) => {
		const request = new Request(new URL(url, "https://book.example"), init);
		const route = routes[new URL(request.url).pathname as keyof typeof routes];
		return route.GET({
			request,
			isPrerendered: false,
			clientAddress: "203.0.113.9",
		} as unknown as APIContext);
	}) as unknown as typeof fetch;
	const readAll = async (token: string | null) =>
		Promise.all(
			Object.keys(routes).map(
				async (url) =>
					(await fetchAuthorJson(url, { token, fetchImpl: server })).state,
			),
		);

	let saved: string | undefined;
	let logged: ReturnType<typeof spyOn>;
	beforeEach(() => {
		saved = process.env.BOOKKIT_AUTHOR_TOKEN;
		logged = spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.BOOKKIT_AUTHOR_TOKEN;
		else process.env.BOOKKIT_AUTHOR_TOKEN = saved;
		logged.mockRestore();
	});

	it("reads the data with the right token", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		expect(await readAll(TOKEN)).toEqual(["ok", "ok", "ok"]);
	});

	it("asks for a token, or says it was refused", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		expect(await readAll(null)).toEqual([
			"needs-token",
			"needs-token",
			"needs-token",
		]);
		expect(await readAll("wrong")).toEqual([
			"token-refused",
			"token-refused",
			"token-refused",
		]);
	});

	it("says when the server has no token set", async () => {
		delete process.env.BOOKKIT_AUTHOR_TOKEN;
		expect(await readAll(TOKEN)).toEqual([
			"not-configured",
			"not-configured",
			"not-configured",
		]);
	});
});

describe("authorAccessView", () => {
	const view = (reads: AuthorReadState[], hasToken: boolean) =>
		authorAccessView(reads, hasToken);

	it("stays hidden where nothing needs the token", () => {
		// bookkit dev answers without one; a static site has nothing to ask.
		expect(view(["ok", "ok"], false).hidden).toBe(true);
		expect(view(["unavailable"], false).hidden).toBe(true);
		expect(view([], false).hidden).toBe(true);
	});

	it("asks for the token, saying what the dashboards show until then", () => {
		const asking = view(["needs-token", "ok"], false);
		expect(asking).toMatchObject({
			hidden: false,
			askForToken: true,
			canForget: false,
		});
		expect(asking.message).toContain("BOOKKIT_AUTHOR_TOKEN");
		expect(asking.message).toContain("this browser's own visits");
	});

	it("says a saved token was refused, and offers to forget it", () => {
		const refused = view(["token-refused", "needs-token"], true);
		expect(refused).toMatchObject({
			hidden: false,
			askForToken: true,
			canForget: true,
		});
		expect(refused.message).toContain("refused the token saved");
	});

	it("tells the author to set the token on the server, without asking for it here", () => {
		const unset = view(["not-configured"], false);
		expect(unset).toMatchObject({ hidden: false, askForToken: false });
		expect(unset.message).toContain("openssl rand -hex 32");
	});

	it("says the server's data is shown with the saved token", () => {
		expect(view(["ok", "ok", "ok"], true)).toMatchObject({
			hidden: false,
			askForToken: false,
			canForget: true,
		});
	});
});
