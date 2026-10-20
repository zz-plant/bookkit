import { describe, expect, it } from "bun:test";
import type { APIContext } from "astro";

import {
	clientAddressOf,
	createRateLimiter,
	jsonResponse,
	parseJsonBody,
	rateLimited,
	requestHandlers,
	tryParseJsonBody,
} from "./http";

describe("http utils", () => {
	it("returns JSON responses with status and content type", async () => {
		const response = jsonResponse({ ok: true }, 201);

		expect(response.status).toBe(201);
		expect(response.headers.get("content-type")).toBe(
			"application/json; charset=utf-8",
		);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("parses valid JSON payloads", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: JSON.stringify({ ok: true }),
			headers: { "content-type": "application/json" },
		});

		await expect(parseJsonBody(request)).resolves.toEqual({ ok: true });
	});

	it("returns null for invalid JSON payloads", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: "not json",
			headers: { "content-type": "application/json" },
		});

		await expect(parseJsonBody(request)).resolves.toBeNull();
	});

	it("returns parse status for valid JSON", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: JSON.stringify({ ok: true }),
			headers: { "content-type": "application/json" },
		});

		await expect(tryParseJsonBody(request)).resolves.toEqual({
			ok: true,
			value: { ok: true },
		});
	});

	it("returns parse status for invalid JSON", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: "not json",
			headers: { "content-type": "application/json" },
		});

		await expect(tryParseJsonBody(request)).resolves.toMatchObject({
			ok: false,
			error: expect.stringContaining("JSON"),
		});
	});
});

describe("requestHandlers", () => {
	const context = (isPrerendered: boolean) =>
		({
			request: new Request("http://localhost/api/feedback.json"),
			isPrerendered,
		}) as APIContext;
	const readLog = () => jsonResponse({ ok: true, events: ["local event"] });
	const record = () => jsonResponse({ ok: true });

	it("answers a static build's prerender with no body, so no file is written", async () => {
		for (const handlers of [
			requestHandlers({ GET: readLog, POST: record }),
			requestHandlers({ POST: record }),
		]) {
			const response = await handlers.GET(context(true));
			expect(response.body).toBeNull();
		}
	});

	it("serves a GET on demand", async () => {
		const handlers = requestHandlers({ GET: readLog, POST: record });
		const response = await handlers.GET(context(false));

		expect(await response.json()).toEqual({
			ok: true,
			events: ["local event"],
		});
	});

	it("answers GET on a POST-only route with 405 and the allowed method", async () => {
		const handlers = requestHandlers({ POST: record });
		const response = await handlers.GET(context(false));

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
		expect(handlers.POST).toBe(record);
	});
});

describe("tryParseJsonBody with maxBytes", () => {
	const post = (body: BodyInit, headers: Record<string, string> = {}) =>
		new Request("http://localhost/test", { method: "POST", body, headers });

	it("parses a body within the limit", async () => {
		await expect(
			tryParseJsonBody(post('{"ok":true}'), { maxBytes: 11 }),
		).resolves.toEqual({ ok: true, value: { ok: true } });
	});

	it("refuses a declared Content-Length over the limit without reading", async () => {
		const request = post('{"ok":true}', { "content-length": "5000" });
		await expect(
			tryParseJsonBody(request, { maxBytes: 100 }),
		).resolves.toMatchObject({ ok: false, tooLarge: true });
		expect(request.bodyUsed).toBe(false);
	});

	it("stops reading a streamed body once it passes the limit", async () => {
		let pulls = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1;
				controller.enqueue(new Uint8Array(64).fill(32));
				if (pulls > 1000) controller.close();
			},
		});
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: stream,
			// @ts-expect-error: required by the fetch spec for a stream body; not in lib.dom yet
			duplex: "half",
		});

		await expect(
			tryParseJsonBody(request, { maxBytes: 256 }),
		).resolves.toMatchObject({
			ok: false,
			tooLarge: true,
			error: "the request body is larger than 256 bytes",
		});
		expect(pulls).toBeLessThan(10);
	});
});

describe("rate limiting", () => {
	it("allows `limit` requests per key per window, then says when to retry", () => {
		const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });

		expect(limiter.take("a", 0)).toBeNull();
		expect(limiter.take("a", 1_000)).toBeNull();
		expect(limiter.take("a", 2_000)).toBe(58);
		expect(limiter.take("b", 2_000)).toBeNull();
		expect(limiter.take("a", 60_000)).toBeNull();
	});

	it("answers 429 with Retry-After per client address, and skips clients the runtime cannot name", async () => {
		let runs = 0;
		const route = rateLimited(
			() => {
				runs += 1;
				return jsonResponse({ ok: true });
			},
			{ perClient: { limit: 1 } },
		);
		const request = new Request("http://localhost/api/analytics.json", {
			method: "POST",
		});

		expect((await route({ request, clientAddress: "1.1.1.1" })).status).toBe(
			200,
		);
		const limited = await route({ request, clientAddress: "1.1.1.1" });
		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
		expect((await route({ request, clientAddress: "2.2.2.2" })).status).toBe(
			200,
		);
		expect((await route({ request })).status).toBe(200);
		expect((await route({ request })).status).toBe(200);
		expect(runs).toBe(4);
	});

	it("caps every client together with `overall`", async () => {
		const route = rateLimited(() => jsonResponse({ ok: true }), {
			perClient: { limit: 10 },
			overall: { limit: 2 },
		});
		const request = new Request("http://localhost/api/qa.json", {
			method: "POST",
		});
		const statuses = [];
		for (const clientAddress of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
			statuses.push((await route({ request, clientAddress })).status);
		}
		expect(statuses).toEqual([200, 200, 429]);
	});

	it("reads the client address where Astro throws for an adapter without one", () => {
		const context = {
			get clientAddress(): string {
				throw new Error("clientAddress is not available in your adapter");
			},
		};
		expect(clientAddressOf(context)).toBeNull();
		expect(clientAddressOf({ clientAddress: "::1" })).toBe("::1");
	});
});
