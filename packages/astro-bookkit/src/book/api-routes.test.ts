import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { APIContext } from "astro";

import { createReaderAnalyticsEndpoint } from "../analytics/endpoint";
import { createExportAnalyticsEndpoint } from "../exports/endpoint";
import { createFeedbackEndpoint } from "../feedback/endpoint";
import { createPreviewAnalyticsEndpoint } from "../preview/endpoint";
import { createBookRuntime } from "./runtime";

// What each API route answers on a server deployment (`site.runtime:
// "server"`): author routes need BOOKKIT_AUTHOR_TOKEN, reader routes bound
// what one client can send.

const TOKEN = "k".repeat(40);

const createApi = () =>
	createBookRuntime({
		bookConfig: {
			slug: "fixture",
			title: "Fixture",
			features: { aiQaProvider: { apiKeyEnvVar: "BOOKKIT_TEST_QA_KEY" } },
		},
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

type Api = ReturnType<typeof createApi>;
type ApiRoute = Exclude<
	keyof Api,
	"createMcpHandlers" | "createMcpHandlersFromModuleUrl"
>;

const context = (
	request: Request,
	extra: { isPrerendered?: boolean; clientAddress?: string } = {},
) =>
	({
		request,
		isPrerendered: false,
		clientAddress: "203.0.113.9",
		...extra,
	}) as unknown as APIContext;

const get = (authorization?: string) =>
	new Request("https://book.example/api/route.json", {
		headers: authorization ? { authorization } : {},
	});

const post = (body: string, headers: Record<string, string> = {}) =>
	new Request("https://book.example/api/route.json", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body,
	});

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

describe("a static build", () => {
	it("still writes no file for any API route, and logs nothing", async () => {
		delete process.env.BOOKKIT_AUTHOR_TOKEN;
		const api = createApi();
		for (const route of [
			"analytics",
			"feedback",
			"exportAnalytics",
			"previewAnalytics",
			"releaseAnalytics",
			"releaseWebhook",
			"releaseEmail",
			"qa",
		] satisfies ApiRoute[]) {
			const response = await api[route].GET(
				context(get(), { isPrerendered: true }),
			);
			expect(response.body).toBeNull();
		}
		expect(logged).not.toHaveBeenCalled();
	});
});

describe("author routes", () => {
	const sending = ["releaseWebhook", "releaseEmail"] satisfies ApiRoute[];
	const reading = [
		"analytics",
		"feedback",
		"previewAnalytics",
	] satisfies ApiRoute[];

	it("refuse every request with 500 when the server has no author token", async () => {
		delete process.env.BOOKKIT_AUTHOR_TOKEN;
		const api = createApi();
		for (const route of sending) {
			const response = await api[route].POST(
				context(post("{}", { authorization: `Bearer ${TOKEN}` })),
			);
			expect(response.status).toBe(500);
		}
		for (const route of reading) {
			const response = await api[route].GET(context(get(`Bearer ${TOKEN}`)));
			expect(response.status).toBe(500);
		}
		expect(logged).toHaveBeenCalledTimes(sending.length + reading.length);
	});

	it("refuse a missing or wrong token with 401", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		const api = createApi();
		for (const authorization of [undefined, "Bearer wrong"]) {
			for (const route of sending) {
				const headers: Record<string, string> = authorization
					? { authorization }
					: {};
				const response = await api[route].POST(context(post("{}", headers)));
				expect(response.status).toBe(401);
			}
			for (const route of reading) {
				const response = await api[route].GET(context(get(authorization)));
				expect(response.status).toBe(401);
			}
		}
	});

	it("answer the author", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		const api = createApi();
		for (const route of reading) {
			const response = await api[route].GET(context(get(`Bearer ${TOKEN}`)));
			expect(response.status).toBe(200);
			expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
		}
		// This fixture has no releases and no targets: the request got past the token.
		const webhook = await api.releaseWebhook.POST(
			context(post("", { authorization: `Bearer ${TOKEN}` })),
		);
		expect(webhook.status).toBe(400);
	});
});

describe("reader routes", () => {
	const readerRoutes: Array<{
		route: ApiRoute;
		maxBytes: number;
		perMinute: number;
	}> = [
		{ route: "analytics", maxBytes: 4 * 1024, perMinute: 120 },
		{ route: "feedback", maxBytes: 16 * 1024, perMinute: 30 },
		{ route: "previewAnalytics", maxBytes: 4 * 1024, perMinute: 30 },
		{ route: "exportAnalytics", maxBytes: 4 * 1024, perMinute: 30 },
		{ route: "releaseAnalytics", maxBytes: 1024, perMinute: 30 },
		{ route: "qa", maxBytes: 64 * 1024, perMinute: 10 },
	];

	it.each(readerRoutes)(
		"$route refuses a body over $maxBytes bytes with 413",
		async ({ route, maxBytes }) => {
			const response = await createApi()[route].POST(
				context(post(JSON.stringify({ pad: "x".repeat(maxBytes) }))),
			);
			expect(response.status).toBe(413);
		},
	);

	it.each(readerRoutes)(
		"$route refuses a body that is not JSON with 400",
		async ({ route }) => {
			const response = await createApi()[route].POST(context(post("{nope")));
			expect(response.status).toBe(400);
		},
	);

	it.each(readerRoutes)(
		"$route allows $perMinute requests a minute from one client",
		async ({ route, perMinute }) => {
			const api = createApi();
			// Invalid bodies count too, and store nothing.
			for (let index = 0; index < perMinute; index += 1) {
				const response = await api[route].POST(context(post("{nope")));
				expect(response.status).toBe(400);
			}
			const limited = await api[route].POST(context(post("{nope")));
			expect(limited.status).toBe(429);
			expect(limited.headers.get("retry-after")).not.toBeNull();

			const other = await api[route].POST(
				context(post("{nope"), { clientAddress: "198.51.100.1" }),
			);
			expect(other.status).toBe(400);
		},
	);
});

describe("reader routes keep accepting what the reader scripts send", () => {
	const request = (body: unknown) => context(post(JSON.stringify(body)));

	it("records analytics, preview, and download events", async () => {
		const recorded: unknown[] = [];
		const onRecord = (event: unknown) => {
			recorded.push(event);
		};
		const responses = await Promise.all([
			createReaderAnalyticsEndpoint({ onRecord }).POST(
				request({ type: "pageview", path: "/read", sessionId: "s1" }),
			),
			createPreviewAnalyticsEndpoint({ onRecord }).POST(
				request({ type: "preview", tokenHint: "abcd", path: "/read" }),
			),
			createExportAnalyticsEndpoint({ onRecord }).POST(
				request({
					type: "download",
					format: "pdf",
					scope: "book",
					metadata: Object.fromEntries(
						Array.from({ length: 50 }, (_, index) => [`k${index}`, "v"]),
					),
				}),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			200, 200, 200,
		]);
		expect(recorded).toHaveLength(3);
		const download = recorded[2] as { metadata: Record<string, string> };
		expect(Object.keys(download.metadata)).toHaveLength(10);
	});

	it("stores feedback, up to 20 events per request", async () => {
		const directory = mkdtempSync(join(tmpdir(), "bookkit-feedback-"));
		try {
			const storagePath = join(directory, "events.json");
			const endpoint = createFeedbackEndpoint({ storagePath });
			const event = { eventType: "feedback", slug: "intro", emoji: "👍" };

			const one = await endpoint.POST(request(event));
			expect(await one.json()).toEqual({ ok: true, stored: 1 });

			const batch = await endpoint.POST(
				request({ events: Array.from({ length: 20 }, () => event) }),
			);
			expect(await batch.json()).toEqual({ ok: true, stored: 20 });

			const flood = await endpoint.POST(
				request({ events: Array.from({ length: 21 }, () => event) }),
			);
			expect(flood.status).toBe(400);
			expect(
				JSON.parse(readFileSync(storagePath, "utf8")) as unknown[],
			).toHaveLength(21);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe("what readers send", () => {
	let savedDataDir: string | undefined;
	let dataDir: string;

	beforeEach(() => {
		savedDataDir = process.env.BOOKKIT_DATA_DIR;
		dataDir = mkdtempSync(join(tmpdir(), "bookkit-api-data-"));
		process.env.BOOKKIT_DATA_DIR = dataDir;
	});
	afterEach(() => {
		if (savedDataDir === undefined) delete process.env.BOOKKIT_DATA_DIR;
		else process.env.BOOKKIT_DATA_DIR = savedDataDir;
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("is kept in the folder BOOKKIT_DATA_DIR names, and read back from there", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		const api = createApi();
		const send = (route: ApiRoute, body: unknown) =>
			api[route].POST(context(post(JSON.stringify(body))));

		const statuses = await Promise.all([
			send("analytics", { type: "pageview", path: "/read/one" }),
			send("previewAnalytics", { type: "preview", tokenHint: "abcd" }),
			send("exportAnalytics", { type: "download", format: "pdf" }),
			send("releaseAnalytics", { event: "rss_subscribe_click" }),
			send("feedback", { eventType: "feedback", slug: "intro" }),
		]).then((responses) => responses.map((response) => response.status));
		expect(statuses).toEqual([200, 200, 200, 200, 200]);

		expect(readdirSync(dataDir).sort()).toEqual([
			"export-analytics.jsonl",
			"feedback-events.json",
			"preview-analytics.jsonl",
			"reader-analytics.jsonl",
			"release-analytics.jsonl",
		]);

		const read = async (route: ApiRoute) =>
			(await api[route].GET(context(get(`Bearer ${TOKEN}`)))).json();
		expect(await read("analytics")).toMatchObject({
			total: 1,
			events: [{ path: "/read/one" }],
		});
		expect(await read("previewAnalytics")).toMatchObject({
			total: 1,
			totals: { abcd: 1 },
		});
		expect(await read("feedback")).toMatchObject({
			events: [{ slug: "intro" }],
		});
	});
});
