import { describe, expect, it } from "bun:test";

import { jsonResponse, parseJsonBody, tryParseJsonBody } from "./http";

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

		await expect(tryParseJsonBody(request)).resolves.toEqual({ ok: false });
	});
});
