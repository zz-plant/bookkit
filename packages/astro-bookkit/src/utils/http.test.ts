import { describe, expect, it } from "bun:test";

import { jsonResponse, parseJsonBody } from "./http";

describe("http utils", () => {
  it("returns JSON responses with status and content type", async () => {
    const response = jsonResponse({ ok: true }, 201);

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
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
});
