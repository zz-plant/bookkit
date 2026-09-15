import { describe, expect, it } from "bun:test";

import { createPreviewAccessMiddleware } from "./access";

type MiddlewareContext = Parameters<
	ReturnType<typeof createPreviewAccessMiddleware>
>[0];

const createContext = (options: {
	url?: string;
	isPrerendered: boolean;
	cookieToken?: string;
}): MiddlewareContext => {
	const cookies = new Map<string, string>();
	if (options.cookieToken) cookies.set("preview_token", options.cookieToken);

	return {
		request: new Request(options.url ?? "https://example.test/read"),
		locals: {},
		isPrerendered: options.isPrerendered,
		cookies: {
			get: (name: string) => {
				const value = cookies.get(name);
				return value === undefined ? undefined : { value };
			},
			set: (name: string, value: string) => {
				cookies.set(name, value);
			},
			delete: (name: string) => {
				cookies.delete(name);
			},
		},
	} as unknown as MiddlewareContext;
};

const next = async () => new Response("page", { status: 200 });

const config = {
	enabled: true,
	tokens: [{ token: "active-token", label: "Reviewer" }],
	siteTitle: "Test Book",
	allowDev: false,
};

describe("createPreviewAccessMiddleware", () => {
	it("lets prerendered routes through even when preview access is enabled", async () => {
		const middleware = createPreviewAccessMiddleware(config);
		const response = await middleware(
			createContext({ isPrerendered: true }),
			next,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("page");
	});

	it("locks on-demand requests that carry no token", async () => {
		const middleware = createPreviewAccessMiddleware(config);
		const response = await middleware(
			createContext({ isPrerendered: false }),
			next,
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
		expect(await response.text()).toContain("preview required");
	});

	it("admits on-demand requests with a valid cookie token", async () => {
		const middleware = createPreviewAccessMiddleware(config);
		const context = createContext({
			isPrerendered: false,
			cookieToken: "active-token",
		});
		const response = await middleware(context, next);

		expect(response.status).toBe(200);
		expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
		expect(
			(context.locals as { preview?: { isPreview: boolean } }).preview
				?.isPreview,
		).toBe(true);
	});

	it("is a no-op when preview access is disabled", async () => {
		const middleware = createPreviewAccessMiddleware({
			...config,
			enabled: false,
		});
		const response = await middleware(
			createContext({ isPrerendered: false }),
			next,
		);

		expect(response.status).toBe(200);
	});
});
