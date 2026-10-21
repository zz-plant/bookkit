import { describe, expect, it } from "bun:test";

import type { ReaderAnalyticsEvent } from "./analytics";
import { createReaderAnalyticsEndpoint } from "./endpoint";

const post = (body: unknown) => ({
	request: new Request("https://book.example/api/analytics.json", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	}),
});

const endpointRecording = () => {
	const recorded: ReaderAnalyticsEvent[] = [];
	const endpoint = createReaderAnalyticsEndpoint({
		onRecord: (event) => {
			recorded.push(event);
		},
	});
	return { endpoint, recorded };
};

/** What `layouts/book-layout/analytics.ts` sends for a page view. */
const pageview = {
	type: "pageview",
	timestamp: Date.now(),
	sessionId: "session-1",
	path: "/read/chapters/rollback-first",
	chapterSlug: "rollback-first",
	version: "0.1.0",
	locale: "en",
	title: "Rollback first · On-call",
};

describe("what a reader may send to the analytics endpoint", () => {
	// What a reader could send by hand, aimed at the author's dashboard,
	// which lists each path and title.
	const XSS = '<img src=x onerror="alert(1)">';

	it("refuses a path that is not a path on this site, saying which and why", async () => {
		const { endpoint, recorded } = endpointRecording();
		const refusals: Array<[unknown, string]> = [
			[undefined, "path is missing"],
			["  ", "path is missing"],
			[42, "path is missing"],
			[XSS, `path ${JSON.stringify(XSS)} is not a path on this site`],
			["read/chapters/one", 'path "read/chapters/one" is not a path'],
			["//evil.example/read", 'path "//evil.example/read" is not a path'],
			["/\\evil.example/read", "is not a path on this site"],
			["/\t/evil.example/read", "is not a path on this site"],
			["https://evil.example/read", "is not a path on this site"],
			["javascript:alert(1)", "is not a path on this site"],
			["/read/\u0000one", "is not a path on this site"],
			[`/${"a".repeat(240)}`, "has at most 240 characters"],
		];
		for (const [path, reason] of refusals) {
			const response = await endpoint.POST(post({ ...pageview, path }));
			expect(response.status, JSON.stringify(path)).toBe(400);
			const { error } = (await response.json()) as { error: string };
			expect(error).toStartWith("Invalid analytics event: path ");
			expect(error).toContain(reason);
		}
		expect(recorded).toEqual([]);
	});

	it("refuses a title that is not plain text, saying which and why", async () => {
		const { endpoint, recorded } = endpointRecording();
		const refusals: Array<[unknown, string]> = [
			[
				XSS,
				`title ${JSON.stringify(XSS)} is not plain text: it holds HTML markup`,
			],
			["</title><script>alert(2)</script>", "it holds HTML markup"],
			["Intro <!-- note -->", "it holds HTML markup"],
			["Intro\u0007", "it holds a control character"],
			[7, "title must be a string"],
		];
		for (const [title, reason] of refusals) {
			const response = await endpoint.POST(post({ ...pageview, title }));
			expect(response.status, JSON.stringify(title)).toBe(400);
			const { error } = (await response.json()) as { error: string };
			expect(error).toStartWith("Invalid analytics event: title ");
			expect(error).toContain(reason);
		}
		expect(recorded).toEqual([]);
	});

	it("refuses an event of another type", async () => {
		const { endpoint } = endpointRecording();
		const response = await endpoint.POST(post({ ...pageview, type: "click" }));
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toBe(
			'Invalid analytics event: type must be "pageview" or "engagement".',
		);
	});

	it("stores what the reader script sends", async () => {
		const { endpoint, recorded } = endpointRecording();
		const sent = [
			pageview,
			{
				...pageview,
				type: "engagement",
				title: undefined,
				durationSeconds: 42,
				scrollDepth: 0.5,
			},
			{ ...pageview, path: "/es/read/glosario/caf%C3%A9", title: "p < 0.05" },
			{ ...pageview, path: "/", title: "T".repeat(200) },
			{ ...pageview, path: "/read/chapters/one?x=1#step-2", title: null },
		];
		for (const event of sent) {
			const response = await endpoint.POST(post(event));
			expect(response.status, JSON.stringify(event)).toBe(200);
		}
		expect(
			recorded.map(({ type, path, title }) => ({ type, path, title })),
		).toEqual([
			{
				type: "pageview",
				path: "/read/chapters/rollback-first",
				title: "Rollback first · On-call",
			},
			{
				type: "engagement",
				path: "/read/chapters/rollback-first",
				title: null,
			},
			{
				type: "pageview",
				path: "/es/read/glosario/caf%C3%A9",
				title: "p < 0.05",
			},
			{ type: "pageview", path: "/", title: "T".repeat(160) },
			{ type: "pageview", path: "/read/chapters/one?x=1#step-2", title: null },
		]);
	});
});
