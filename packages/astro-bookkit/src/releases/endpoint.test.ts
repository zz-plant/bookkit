import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import {
	createReleaseEmailEndpoint,
	createReleaseWebhookEndpoint,
} from "./endpoint";

const TOKEN = "r".repeat(48);
const modules = {
	"src/content/book/releases/2026-10-01.mdx": {
		frontmatter: {
			title: "First release",
			version: "1.0.0",
			date: "2026-10-01",
			summary: "Summary",
		},
	},
};
const book = { slug: "fixture", title: "Fixture" };
const target = {
	name: "subscribers",
	url: "https://hooks.example/services/T000/B000/s3cr3t-path",
	secret: "target-secret",
	headers: { Authorization: "Bearer provider-key" },
};

const endpoints = [
	{
		route: "POST /api/release-webhook.json",
		endpoint: createReleaseWebhookEndpoint({
			modules,
			book,
			webhookTargets: [target],
		}),
		noTargets: createReleaseWebhookEndpoint({ modules, book }),
		event: "release_published",
	},
	{
		route: "POST /api/release-email.json",
		endpoint: createReleaseEmailEndpoint({
			modules,
			book,
			emailTargets: [target],
		}),
		noTargets: createReleaseEmailEndpoint({ modules, book }),
		event: "release_email",
	},
];

const post = (authorization?: string, body?: string) =>
	new Request("https://book.example/api/release.json", {
		method: "POST",
		headers: authorization ? { authorization } : {},
		body,
	});

describe.each(endpoints)("$route", ({ route, endpoint, noTargets, event }) => {
	let saved: { token?: string; webhooks?: string; email?: string };
	let logged: ReturnType<typeof spyOn>;
	let sent: ReturnType<typeof spyOn>;

	beforeEach(() => {
		saved = {
			token: process.env.BOOKKIT_AUTHOR_TOKEN,
			webhooks: process.env.BOOKKIT_RELEASE_WEBHOOKS,
			email: process.env.BOOKKIT_RELEASE_EMAIL_TARGETS,
		};
		delete process.env.BOOKKIT_RELEASE_WEBHOOKS;
		delete process.env.BOOKKIT_RELEASE_EMAIL_TARGETS;
		logged = spyOn(console, "error").mockImplementation(() => {});
		sent = spyOn(globalThis, "fetch").mockImplementation(
			async () => new Response(null, { status: 202 }),
		);
	});
	afterEach(() => {
		for (const [key, value] of [
			["BOOKKIT_AUTHOR_TOKEN", saved.token],
			["BOOKKIT_RELEASE_WEBHOOKS", saved.webhooks],
			["BOOKKIT_RELEASE_EMAIL_TARGETS", saved.email],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		logged.mockRestore();
		sent.mockRestore();
	});

	it("sends nothing and answers 500 when the server has no author token", async () => {
		delete process.env.BOOKKIT_AUTHOR_TOKEN;
		const response = await endpoint.POST({ request: post(`Bearer ${TOKEN}`) });

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			ok: false,
			error: "This endpoint is not configured on this server.",
		});
		expect(sent).not.toHaveBeenCalled();
		expect(String(logged.mock.calls[0]?.[0])).toContain(
			`${route} refused a request: BOOKKIT_AUTHOR_TOKEN is not set`,
		);
	});

	it("sends nothing and answers 401 for a missing or wrong token", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		for (const header of [undefined, "Bearer wrong", `Token ${TOKEN}`]) {
			const response = await endpoint.POST({ request: post(header) });
			expect(response.status).toBe(401);
		}
		// Configuration stays hidden from a caller without the token.
		const unconfigured = await noTargets.POST({ request: post() });
		expect(unconfigured.status).toBe(401);
		expect(sent).not.toHaveBeenCalled();
	});

	it("sends the latest release for the right token, and keeps target secrets out of the answer", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		const response = await endpoint.POST({
			request: post(`Bearer ${TOKEN}`, "x".repeat(1_000_000)),
		});
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(JSON.parse(text)).toEqual({
			ok: true,
			delivered: [
				{ target: "subscribers", status: "success", statusCode: 202 },
			],
		});
		expect(text).not.toContain("s3cr3t-path");
		expect(text).not.toContain("target-secret");
		expect(text).not.toContain("provider-key");

		expect(sent).toHaveBeenCalledTimes(1);
		const [url, init] = sent.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(target.url);
		expect(JSON.parse(String(init.body))).toMatchObject({
			event,
			release: { version: "1.0.0" },
			book,
		});
	});

	it("names a target without a name by its host only", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		process.env.BOOKKIT_RELEASE_WEBHOOKS = target.url;
		process.env.BOOKKIT_RELEASE_EMAIL_TARGETS = target.url;
		const response = await noTargets.POST({ request: post(`Bearer ${TOKEN}`) });

		expect(await response.json()).toEqual({
			ok: true,
			delivered: [
				{ target: "hooks.example", status: "success", statusCode: 202 },
			],
		});
	});

	it("says when no targets are configured, once the caller is the author", async () => {
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
		const response = await noTargets.POST({ request: post(`Bearer ${TOKEN}`) });

		expect(response.status).toBe(400);
		expect(sent).not.toHaveBeenCalled();
	});
});
