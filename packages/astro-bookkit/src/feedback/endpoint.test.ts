import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createFeedbackEndpoint,
	FEEDBACK_EMOJI,
	FEEDBACK_RESPONSES,
	type FeedbackEvent,
} from "./endpoint";

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

const stored = async (endpoint: ReturnType<typeof createFeedbackEndpoint>) =>
	((await (await endpoint.GET(get())).json()) as { events: FeedbackEvent[] })
		.events;

const slugs = async (endpoint: ReturnType<typeof createFeedbackEndpoint>) =>
	(await stored(endpoint)).map((event) => event.slug);

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

	describe("what a reader may send", () => {
		// What a reader could send by hand, aimed at the author's dashboard,
		// which shows the slug and the emoji.
		const XSS = '<img src=x onerror="alert(1)">';

		it("refuses a slug, reaction, or emoji the widget never sends, saying which and why", async () => {
			const endpoint = createFeedbackEndpoint();
			const refusals: Array<[Record<string, unknown>, string]> = [
				[
					{ eventType: "feedback", slug: XSS },
					`slug ${JSON.stringify(XSS)} is not a page's slug, which has only lowercase letters, digits, and hyphens, and at most 200 of them`,
				],
				[
					{ eventType: "impression", slug: "Rollback First" },
					'slug "Rollback First"',
				],
				[{ eventType: "feedback", slug: "a".repeat(201) }, "at most 200"],
				[{ eventType: "feedback", slug: 7 }, "slug is missing"],
				[
					{
						eventType: "feedback",
						slug: "intro",
						responseType: "emoji",
						emoji: "<script>alert(2)</script>",
					},
					'emoji "<script>alert(2)</script>" is not one the widget offers: 😀 🤔 😕 🔥',
				],
				[
					{ eventType: "feedback", slug: "intro", responseType: XSS },
					`responseType ${JSON.stringify(XSS)} is not one of helpful, not_helpful, emoji`,
				],
				[
					{ eventType: "feedback", slug: "intro", responseType: "emoji" },
					'responseType "emoji" needs an emoji',
				],
				[
					{ eventType: "script", slug: "intro" },
					'eventType must be "feedback"',
				],
			];
			for (const [event, reason] of refusals) {
				const response = await endpoint.POST(post(event));
				expect(response.status, JSON.stringify(event)).toBe(400);
				const { error } = (await response.json()) as { error: string };
				expect(error).toStartWith("Invalid feedback payload: ");
				expect(error).toContain(reason);
			}
			expect(await stored(endpoint)).toEqual([]);
		});

		it("stores what the widget sends, and a batch's events but those it refuses", async () => {
			const endpoint = createFeedbackEndpoint();
			const widget = {
				slug: "rollback-first",
				title: "Rollback first",
				contentType: "chapter",
				version: "draft",
			};
			const sent = [
				{ ...widget, eventType: "impression" },
				{
					...widget,
					eventType: "feedback",
					responseType: "helpful",
					emoji: null,
					comment: "Clear.",
				},
				{
					...widget,
					eventType: "feedback",
					responseType: "emoji",
					emoji: "🔥",
				},
			];
			for (const event of sent) {
				expect((await endpoint.POST(post(event))).status).toBe(200);
			}
			const batch = await endpoint.POST(
				post({
					events: [
						{ eventType: "impression", slug: "drills" },
						{ eventType: "impression", slug: XSS },
					],
				}),
			);
			expect(await batch.json()).toEqual({ ok: true, stored: 1 });

			expect(
				(await stored(endpoint)).map(({ slug, responseType, emoji }) => ({
					slug,
					responseType,
					emoji,
				})),
			).toEqual([
				{ slug: "rollback-first", responseType: null, emoji: null },
				{ slug: "rollback-first", responseType: "helpful", emoji: null },
				{ slug: "rollback-first", responseType: "emoji", emoji: "🔥" },
				{ slug: "drills", responseType: null, emoji: null },
			]);

			const refused = await endpoint.POST(
				post({ events: [{ eventType: "impression", slug: XSS }] }),
			);
			expect(((await refused.json()) as { error: string }).error).toContain(
				`events[0]: slug ${JSON.stringify(XSS)} is not a page's slug`,
			);
		});

		it("accepts each reaction the widget offers, and only those", () => {
			const widget = readFileSync(
				join(import.meta.dir, "..", "components", "FeedbackWidget.astro"),
				"utf8",
			);
			const choices = [
				...widget.matchAll(/data-feedback-choice="([^"]+)"/g),
			].map(([, choice]) => choice);
			expect(choices.filter((choice) => !choice.startsWith("emoji:"))).toEqual(
				FEEDBACK_RESPONSES.filter((response) => response !== "emoji"),
			);
			expect(
				choices
					.filter((choice) => choice.startsWith("emoji:"))
					.map((choice) => choice.slice("emoji:".length)),
			).toEqual([...FEEDBACK_EMOJI]);
		});
	});
});
