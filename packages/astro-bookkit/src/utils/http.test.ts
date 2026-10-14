import { describe, expect, it } from "bun:test";
import type { APIContext } from "astro";

import {
	jsonResponse,
	parseJsonBody,
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
