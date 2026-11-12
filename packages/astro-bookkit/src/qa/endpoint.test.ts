import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { SearchEntry } from "../search";
import {
	createQaApiHandlers,
	filterEntriesToReadingWindow,
	parseQaRequest,
	QA_LIMITS,
} from "./endpoint";

const entry = (slug: string): SearchEntry => ({
	id: `chapters-${slug}-intro`,
	type: "chapters",
	label: "Chapters",
	order: 1,
	title: slug,
	section: null,
	snippet: "snippet",
	url: `/read/chapters/${slug}`,
	context: slug,
});

describe("filterEntriesToReadingWindow", () => {
	const entries = [entry("intro"), entry("ch2"), entry("ch3")];

	it("returns all entries when no unlocked slugs are provided", () => {
		expect(filterEntriesToReadingWindow(entries)).toHaveLength(3);
		expect(filterEntriesToReadingWindow(entries, [])).toHaveLength(3);
	});

	it("restricts entries to the unlocked slugs", () => {
		const filtered = filterEntriesToReadingWindow(entries, ["intro", "ch2"]);
		expect(filtered.map((e) => e.context)).toEqual(["intro", "ch2"]);
	});

	it("falls back to all entries when nothing matches", () => {
		expect(filterEntriesToReadingWindow(entries, ["nonexistent"])).toHaveLength(
			3,
		);
	});
});

describe("parseQaRequest", () => {
	const question = "What is a handoff?";

	it("keeps only the fields the model sees", () => {
		const parsed = parseQaRequest({
			question,
			entries: [{ ...entry("intro"), score: 3, extra: "x".repeat(5000) }],
			history: [{ question: "Q", answer: "A" }],
		});
		expect(parsed).toEqual({
			ok: true,
			value: {
				question,
				entries: [{ ...entry("intro"), order: 1 }],
				history: [{ question: "Q", answer: "A" }],
				unlocked: undefined,
			},
		});
	});

	it("names the field and the limit a request breaks", () => {
		const cases: Array<[unknown, string]> = [
			[null, "send a JSON object"],
			[{ question: "  ", entries: [] }, "question must be a non-empty string"],
			[
				{ question: "q".repeat(QA_LIMITS.questionLength + 1), entries: [] },
				"question is longer than 1000 characters",
			],
			[{ question }, "entries must be an array"],
			[
				{
					question,
					entries: Array.from({ length: QA_LIMITS.entries + 1 }, () =>
						entry("intro"),
					),
				},
				"entries holds more than 12 passages",
			],
			[
				{ question, entries: [{ ...entry("intro"), snippet: 42 }] },
				"entries[0].snippet must be a string",
			],
			[
				{
					question,
					entries: [{ ...entry("intro"), snippet: "s".repeat(1001) }],
				},
				"entries[0].snippet is longer than 1000 characters",
			],
			[
				{
					question,
					entries: [],
					history: Array.from({ length: 7 }, () => ({
						question: "q",
						answer: "a",
					})),
				},
				"history holds more than 6 turns",
			],
			[
				{
					question,
					entries: [],
					history: [{ question: "q", answer: "a".repeat(4001) }],
				},
				"history[0].answer is longer than 4000 characters",
			],
			[
				{ question, entries: [], unlocked: [1] },
				"unlocked must be at most 500 slugs",
			],
		];
		for (const [raw, error] of cases) {
			const parsed = parseQaRequest(raw);
			expect(parsed.ok).toBe(false);
			expect(parsed.ok ? "" : parsed.error).toContain(error);
		}
	});
});

describe("POST /api/qa.json", () => {
	let saved: string | undefined;
	let model: ReturnType<typeof spyOn>;
	const handlers = () =>
		createQaApiHandlers({ provider: { apiKeyEnvVar: "BOOKKIT_TEST_QA_KEY" } });
	const ask = (body: string, clientAddress = "203.0.113.7") => ({
		request: new Request("https://book.example/api/qa.json", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		}),
		clientAddress,
	});
	const valid = JSON.stringify({
		question: "What is a handoff?",
		entries: [entry("intro")],
	});

	beforeEach(() => {
		saved = process.env.BOOKKIT_TEST_QA_KEY;
		process.env.BOOKKIT_TEST_QA_KEY = "test-key";
		model = spyOn(globalThis, "fetch").mockImplementation(async () =>
			Response.json({ choices: [{ message: { content: "An answer." } }] }),
		);
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.BOOKKIT_TEST_QA_KEY;
		else process.env.BOOKKIT_TEST_QA_KEY = saved;
		model.mockRestore();
	});

	// Context the APIRoute type requires but these handlers never read.
	type Context = Parameters<ReturnType<typeof handlers>["POST"]>[0];
	const call = (route: ReturnType<typeof handlers>, context: object) =>
		Promise.resolve(route.POST(context as Context));

	it("answers a valid question from the model", async () => {
		const response = await call(handlers(), ask(valid));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ answer: "An answer." });
		expect(model).toHaveBeenCalledTimes(1);
	});

	it("refuses an oversized or invalid body without calling the model", async () => {
		const route = handlers();
		const oversized = await call(
			route,
			ask(
				JSON.stringify({ question: "q", entries: [], pad: "x".repeat(70_000) }),
			),
		);
		expect(oversized.status).toBe(413);

		const notJson = await call(route, ask("{nope"));
		expect(notJson.status).toBe(400);

		const tooManyPassages = await call(
			route,
			ask(
				JSON.stringify({
					question: "q",
					entries: Array.from({ length: 13 }, () => entry("intro")),
				}),
			),
		);
		expect(tooManyPassages.status).toBe(400);
		expect(await tooManyPassages.json()).toEqual({
			error: "Invalid request body: entries holds more than 12 passages.",
		});
		expect(model).not.toHaveBeenCalled();
	});

	it("limits questions per reader and overall", async () => {
		const route = handlers();
		const statuses: number[] = [];
		for (let index = 0; index <= QA_LIMITS.perClient.limit; index += 1) {
			statuses.push((await call(route, ask(valid))).status);
		}
		expect(statuses.at(-1)).toBe(429);
		expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);

		const everyone = handlers();
		let last = 0;
		for (let index = 0; index <= QA_LIMITS.overall.limit; index += 1) {
			last = (await call(everyone, ask(valid, `198.51.100.${index}`))).status;
		}
		expect(last).toBe(429);
		expect(model).toHaveBeenCalledTimes(
			QA_LIMITS.perClient.limit + QA_LIMITS.overall.limit,
		);
	});
});

describe("Claude through Anthropic's SDK", () => {
	const saved: Record<string, string | undefined> = {};
	const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"];
	let sent: Array<{
		url: string;
		headers: Headers;
		body: Record<string, unknown>;
	}>;
	let replies: Response[];
	let model: ReturnType<typeof spyOn>;

	const claudeReply = (content: unknown[], stop_reason = "end_turn") =>
		Response.json({
			id: "msg_test",
			type: "message",
			role: "assistant",
			model: "claude-opus-5-5",
			content,
			stop_reason,
			stop_sequence: null,
			usage: { input_tokens: 10, output_tokens: 5 },
		});

	beforeEach(() => {
		for (const key of keys) saved[key] = process.env[key];
		process.env.ANTHROPIC_API_KEY = "sk-ant-test";
		delete process.env.OPENAI_API_KEY;
		delete process.env.GROQ_API_KEY;
		sent = [];
		replies = [];
		model = spyOn(globalThis, "fetch").mockImplementation((async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const request = new Request(input, init);
			sent.push({
				url: request.url,
				headers: request.headers,
				body: JSON.parse(await request.text()),
			});
			return replies.shift() ?? Response.json({}, { status: 500 });
		}) as typeof fetch);
	});
	afterEach(() => {
		for (const key of keys) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
		model.mockRestore();
	});

	type Context = Parameters<ReturnType<typeof createQaApiHandlers>["POST"]>[0];
	const ask = (route: ReturnType<typeof createQaApiHandlers>) =>
		Promise.resolve(
			route.POST({
				request: new Request("https://book.example/api/qa.json", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						question: "What is a handoff?",
						entries: [entry("intro")],
					}),
				}),
				clientAddress: "203.0.113.9",
			} as unknown as Context),
		);

	it("answers with Claude when ANTHROPIC_API_KEY is set, before the other providers", async () => {
		process.env.OPENAI_API_KEY = "sk-openai-test";
		replies.push(
			claudeReply([
				{ type: "thinking", thinking: "", signature: "x" },
				{ type: "text", text: "A handoff moves the work." },
			]),
		);
		const response = await ask(createQaApiHandlers({}));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			answer: "A handoff moves the work.",
		});
		expect(sent).toHaveLength(1);
		const [request] = sent;
		expect(request.url).toBe("https://api.anthropic.com/v1/messages");
		expect(request.headers.get("authorization")).toBe("Bearer sk-ant-test");
		expect(request.headers.get("anthropic-beta")).toContain(
			"server-side-fallback-2026-07-01",
		);
		expect(request.body).toMatchObject({
			model: "claude-opus-5-5",
			max_tokens: 4096,
			output_config: { effort: "low" },
			fallbacks: "default",
		});
		expect(request.body.temperature).toBeUndefined();
		expect(String(request.body.system)).toContain(
			"ONLY the provided book passages",
		);
	});

	it("moves on to the next provider when Claude refuses or the API fails", async () => {
		process.env.OPENAI_API_KEY = "sk-openai-test";
		replies.push(
			claudeReply([], "refusal"),
			Response.json({ choices: [{ message: { content: "From OpenAI." } }] }),
		);
		const refused = await ask(createQaApiHandlers({}));
		expect(await refused.json()).toMatchObject({ answer: "From OpenAI." });

		replies.push(
			Response.json({ error: { type: "api_error" } }, { status: 500 }),
			Response.json({ choices: [{ message: { content: "Again OpenAI." } }] }),
		);
		const failed = await ask(createQaApiHandlers({}));
		expect(await failed.json()).toMatchObject({ answer: "Again OpenAI." });
	});

	it("takes the author's model, and sends no fallback or effort a model does not take", async () => {
		replies.push(claudeReply([{ type: "text", text: "Short." }]));
		const response = await ask(
			createQaApiHandlers({
				provider: { model: "claude-haiku-5-5", effort: false, maxTokens: 1024 },
			}),
		);
		expect(await response.json()).toMatchObject({ answer: "Short." });
		expect(sent[0].url).toBe("https://api.anthropic.com/v1/messages");
		expect(sent[0].body).toMatchObject({
			model: "claude-haiku-5-5",
			max_tokens: 1024,
		});
		expect(sent[0].body.fallbacks).toBeUndefined();
		expect(sent[0].body.output_config).toBeUndefined();
	});
});
