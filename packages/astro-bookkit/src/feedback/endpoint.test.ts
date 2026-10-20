import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFeedbackEndpoint, type FeedbackEvent } from "./endpoint";

const TOKEN = "f".repeat(40);

const post = (body: unknown) => ({
	request: new Request("https://book.example/api/feedback.json", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	}),
});

const get = () => ({
	request: new Request("https://book.example/api/feedback.json", {
		headers: { authorization: `Bearer ${TOKEN}` },
	}),
});

const slugs = async (endpoint: ReturnType<typeof createFeedbackEndpoint>) =>
	(
		(await (await endpoint.GET(get())).json()) as { events: FeedbackEvent[] }
	).events.map((event) => event.slug);

describe("feedback", () => {
	let dataDir: string;
	let saved: Record<string, string | undefined>;

	beforeEach(() => {
		saved = {
			BOOKKIT_DATA_DIR: process.env.BOOKKIT_DATA_DIR,
			BOOKKIT_AUTHOR_TOKEN: process.env.BOOKKIT_AUTHOR_TOKEN,
		};
		dataDir = mkdtempSync(join(tmpdir(), "bookkit-feedback-"));
		process.env.BOOKKIT_DATA_DIR = dataDir;
		process.env.BOOKKIT_AUTHOR_TOKEN = TOKEN;
	});
	afterEach(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("keeps every event when many readers send at the same moment", async () => {
		const endpoint = createFeedbackEndpoint();
		const sent = Array.from({ length: 200 }, (_, index) => `page-${index}`);
		const batches = Array.from({ length: 5 }, (_, batch) =>
			Array.from({ length: 20 }, (_, index) => `batch-${batch}-${index}`),
		);

		const responses = await Promise.all([
			...sent.map((slug) =>
				endpoint.POST(post({ eventType: "feedback", slug })),
			),
			...batches.map((batch) =>
				endpoint.POST(
					post({
						events: batch.map((slug) => ({ eventType: "impression", slug })),
					}),
				),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual(
			responses.map(() => 200),
		);
		const stored = await slugs(endpoint);
		expect(stored).toHaveLength(300);
		expect([...stored].sort()).toEqual([...sent, ...batches.flat()].sort());
		// A request's events stay together, in the order it sent them.
		for (const batch of batches) {
			const start = stored.indexOf(batch[0]);
			expect(stored.slice(start, start + batch.length)).toEqual(batch);
		}
	});

	it("reads feedback kept in the old feedback-events.json before what came after", async () => {
		writeFileSync(
			join(dataDir, "feedback-events.json"),
			JSON.stringify(
				[
					{
						id: "old",
						eventType: "feedback",
						timestamp: Date.now(),
						slug: "old",
					},
				],
				null,
				2,
			),
		);
		const endpoint = createFeedbackEndpoint();
		await endpoint.POST(post({ eventType: "feedback", slug: "new" }));

		expect(await slugs(endpoint)).toEqual(["old", "new"]);
	});

	it("reads only the newest maxEvents", async () => {
		const endpoint = createFeedbackEndpoint({ maxEvents: 3 });
		for (const slug of ["a", "b", "c", "d"]) {
			await endpoint.POST(post({ eventType: "feedback", slug }));
		}

		expect(await slugs(endpoint)).toEqual(["b", "c", "d"]);
	});

	it("answers 500 when the event cannot be stored", async () => {
		const warned = spyOn(console, "warn").mockImplementation(() => {});
		try {
			// A folder inside a file cannot be created.
			writeFileSync(join(dataDir, "a-file"), "");
			const endpoint = createFeedbackEndpoint({
				storagePath: join(dataDir, "a-file", "feedback.jsonl"),
			});
			const response = await endpoint.POST(
				post({ eventType: "feedback", slug: "intro" }),
			);

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				ok: false,
				error: "Unable to store feedback.",
			});
		} finally {
			warned.mockRestore();
		}
	});
});
