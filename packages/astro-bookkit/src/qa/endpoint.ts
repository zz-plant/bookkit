import Anthropic from "@anthropic-ai/sdk";
import type { APIRoute } from "astro";
import type { SearchEntry } from "../search";
import {
	invalidBodyResponse,
	jsonResponse,
	type RateLimit,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";

export type AiQaProviderConfig = {
	/**
	 * The wire format: Anthropic's Messages API through its SDK, or an
	 * OpenAI-compatible chat completions endpoint. Default: "anthropic" for
	 * ANTHROPIC_API_KEY or a `claude-` model, else "openai".
	 */
	api?: "anthropic" | "openai";
	/** For "anthropic", the API's base URL (default: the SDK's). */
	apiUrl?: string;
	apiKeyEnvVar?: string;
	model?: string;
	maxTokens?: number;
	/** Ignored by "anthropic": current Claude models reject sampling settings. */
	temperature?: number;
	systemPrompt?: string;
	/**
	 * For "anthropic": how much the model thinks before it answers (default
	 * "low", for a short grounded answer within the time limit); `false`
	 * leaves it out, for a model that does not take it.
	 */
	effort?: "low" | "medium" | "high" | "xhigh" | "max" | false;
};

export type QaRequest = {
	question: string;
	entries: SearchEntry[];
	history?: QaTurn[];
	/** Reading-order unlocked content slugs. When present, only passages from these slugs are grounded. */
	unlocked?: string[];
};

export type QaTurn = {
	question: string;
	answer: string;
};

export type QaResponse = {
	answer: string;
	citations: Array<{ id: string; title: string; url: string }>;
};

const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_SYSTEM_PROMPT =
	"You are a precise research assistant. Answer the user's question using ONLY the provided book passages. Be concise. If the passages don't contain enough information, say so clearly.";

const LLM_TIMEOUT_MS = 10_000;

/** Claude's default for reader answers; `model` in the provider config picks another. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
/**
 * Room for the model's thinking as well as the answer: a Claude model's
 * thinking counts toward max_tokens, and a cut-off answer is worse than a
 * long one. The system prompt asks for a concise answer.
 */
const DEFAULT_CLAUDE_MAX_TOKENS = 4096;
/** A thinking model answers more slowly than the chat models above. */
const CLAUDE_TIMEOUT_MS = 20_000;
/**
 * Models that take Anthropic's server-side fallback: when one declines a
 * request, the API answers it with another model in the same call.
 */
const SERVER_FALLBACK_MODELS = new Set([
	"claude-opus-5-5",
	"claude-opus-5",
	"claude-sonnet-5-5",
	"claude-fable-5-2",
	"claude-fable-5-1",
]);

export const isAnthropicProvider = (provider: AiQaProviderConfig): boolean =>
	provider.api !== undefined
		? provider.api === "anthropic"
		: provider.apiKeyEnvVar === "ANTHROPIC_API_KEY" ||
			(provider.model?.startsWith("claude-") ?? false);

const entrySlug = (entry: SearchEntry): string => {
	const segment = entry.url.split("#")[0]?.split("/").pop() ?? "";
	return segment.replace(/\.(md|mdx)$/, "");
};

export const filterEntriesToReadingWindow = (
	entries: SearchEntry[],
	unlocked?: string[],
): SearchEntry[] => {
	if (!unlocked || unlocked.length === 0) return entries;
	const unlockedSet = new Set(unlocked.map((slug) => slug.toLowerCase()));
	const filtered = entries.filter((entry) => {
		const slug = entrySlug(entry).toLowerCase();
		const context = entry.context?.toLowerCase() ?? "";
		return unlockedSet.has(slug) || unlockedSet.has(context);
	});
	// Fall back to all entries when nothing matches so Q&A never breaks the reader.
	return filtered.length > 0 ? filtered : entries;
};

const WELL_KNOWN_PROVIDERS: readonly AiQaProviderConfig[] = [
	{
		api: "anthropic",
		apiKeyEnvVar: "ANTHROPIC_API_KEY",
		model: DEFAULT_CLAUDE_MODEL,
		maxTokens: DEFAULT_CLAUDE_MAX_TOKENS,
	},
	{
		apiKeyEnvVar: "OPENAI_API_KEY",
		apiUrl: DEFAULT_API_URL,
		model: "gpt-4o-mini",
		maxTokens: DEFAULT_MAX_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
	},
	{
		apiKeyEnvVar: "GROQ_API_KEY",
		apiUrl: "https://api.groq.com/openai/v1/chat/completions",
		model: "llama-3.1-8b-instant",
		maxTokens: DEFAULT_MAX_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
	},
];

const isString = (value: unknown): value is string => typeof value === "string";
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const resolveProviders = (options: {
	provider?: AiQaProviderConfig;
	providers?: AiQaProviderConfig[];
}): AiQaProviderConfig[] | null => {
	if (options.providers && options.providers.length > 0) {
		return options.providers;
	}
	if (options.provider) {
		return [options.provider];
	}

	const detected = WELL_KNOWN_PROVIDERS.filter((p) => {
		const key =
			typeof process !== "undefined"
				? process.env[p.apiKeyEnvVar ?? ""]
				: undefined;
		return !!key;
	});

	return detected.length > 0 ? detected : null;
};

/** What every provider is asked: the system prompt and the question with its passages. */
const promptFor = (provider: AiQaProviderConfig, body: QaRequest) => {
	const windowedEntries = filterEntriesToReadingWindow(
		body.entries,
		body.unlocked,
	);
	const context = windowedEntries
		.map(
			(entry, i) =>
				`[${i + 1}] ${entry.title} (${entry.context})\n${entry.snippet}`,
		)
		.join("\n\n");

	let system = provider.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	if (body.unlocked && body.unlocked.length > 0) {
		system += ` The reader has only reached the following content: ${body.unlocked.join(", ")}. Use only passages from that content.`;
	}

	let user = `Question: ${body.question}\n\nBook passages:\n${context}`;
	if (body.history && body.history.length > 0) {
		const historyText = body.history
			.map(
				(turn, i) => `Q${i + 1}: ${turn.question}\nA${i + 1}: ${turn.answer}`,
			)
			.join("\n\n");
		user = `Conversation so far:\n${historyText}\n\n${user}`;
	}
	return {
		system,
		user,
		citations: windowedEntries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			url: entry.url,
		})),
	};
};

const apiKeyOf = (envVar: string): string | undefined =>
	typeof process !== "undefined" ? process.env[envVar] : undefined;

/**
 * One answer from Claude through Anthropic's SDK, or null so the next
 * provider is tried: no key, a timeout, an API error, a refusal, or an
 * empty reply. Thinking is always on in current Claude models, so effort
 * (default "low") is the control, and sampling settings are not sent.
 */
const callAnthropic = async (
	provider: AiQaProviderConfig,
	body: QaRequest,
): Promise<QaResponse | null> => {
	const apiKey = apiKeyOf(provider.apiKeyEnvVar ?? "ANTHROPIC_API_KEY");
	if (!apiKey) return null;
	const model = provider.model ?? DEFAULT_CLAUDE_MODEL;
	const { system, user, citations } = promptFor(provider, body);
	const effort = provider.effort ?? "low";
	const client = new Anthropic({
		apiKey,
		...(provider.apiUrl ? { baseURL: provider.apiUrl } : {}),
		timeout: CLAUDE_TIMEOUT_MS,
		// The reader is waiting, and the next provider is a retry of its own.
		maxRetries: 0,
	});
	try {
		const response = await client.beta.messages.create({
			model,
			max_tokens: provider.maxTokens ?? DEFAULT_CLAUDE_MAX_TOKENS,
			system,
			messages: [{ role: "user", content: user }],
			...(effort === false ? {} : { output_config: { effort } }),
			...(SERVER_FALLBACK_MODELS.has(model)
				? {
						betas: ["server-side-fallback-2026-07-01"],
						fallbacks: "default" as const,
					}
				: {}),
		});
		// A refusal from every model in the chain: no answer to show.
		if (response.stop_reason === "refusal") return null;
		const answer = response.content
			.flatMap((block) => (block.type === "text" ? [block.text] : []))
			.join("")
			.trim();
		return answer ? { answer, citations } : null;
	} catch (error) {
		if (error instanceof Anthropic.APIError) return null;
		throw error;
	}
};

/** One answer from an OpenAI-compatible chat completions endpoint, or null. */
const callOpenAiCompatible = async (
	provider: AiQaProviderConfig,
	body: QaRequest,
): Promise<QaResponse | null> => {
	const apiUrl = provider.apiUrl ?? DEFAULT_API_URL;
	const apiKey = apiKeyOf(provider.apiKeyEnvVar ?? "OPENAI_API_KEY");
	if (!apiKey) return null;

	const model = provider.model ?? DEFAULT_MODEL;
	const maxTokens = provider.maxTokens ?? DEFAULT_MAX_TOKENS;
	const temperature = provider.temperature ?? DEFAULT_TEMPERATURE;
	const { system, user, citations } = promptFor(provider, body);

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				max_tokens: maxTokens,
				temperature,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) return null;

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
		if (!answer) return null;

		return { answer, citations };
	} catch {
		return null;
	}
};

const callLlm = (
	provider: AiQaProviderConfig,
	body: QaRequest,
): Promise<QaResponse | null> =>
	isAnthropicProvider(provider)
		? callAnthropic(provider, body)
		: callOpenAiCompatible(provider, body);

/**
 * Each call costs the author money, and the passages come from the reader's
 * browser, so the endpoint bounds what one request can send and how often.
 * The Ask panel sends at most 8 passages of about 160 characters and the last
 * 3 turns.
 */
export const QA_LIMITS = {
	maxBodyBytes: 64 * 1024,
	questionLength: 1000,
	entries: 12,
	entryFieldLength: 1000,
	historyTurns: 6,
	historyAnswerLength: 4000,
	unlockedSlugs: 500,
	slugLength: 200,
	/** Questions per reader address per minute. */
	perClient: { limit: 10 } satisfies RateLimit,
	/** Questions per minute from everyone, per server process. */
	overall: { limit: 60 } satisfies RateLimit,
} as const;

type ParsedQaRequest =
	| { ok: true; value: QaRequest }
	| { ok: false; error: string };

const tooLong = (field: string, limit: number) =>
	`${field} is longer than ${limit} characters`;

const readEntry = (value: unknown, index: number): SearchEntry | string => {
	const field = `entries[${index}]`;
	if (!isRecord(value)) return `${field} must be an object`;
	const text: Record<string, string> = {};
	for (const key of ["id", "title", "url", "snippet", "context"] as const) {
		const raw = value[key] ?? (key === "context" ? "" : undefined);
		if (!isString(raw)) return `${field}.${key} must be a string`;
		if (raw.length > QA_LIMITS.entryFieldLength)
			return tooLong(`${field}.${key}`, QA_LIMITS.entryFieldLength);
		text[key] = raw;
	}
	return {
		id: text.id ?? "",
		title: text.title ?? "",
		url: text.url ?? "",
		snippet: text.snippet ?? "",
		context: text.context ?? "",
		type: isString(value.type) ? value.type.slice(0, 40) : "",
		label: isString(value.label) ? value.label.slice(0, 80) : "",
		order: typeof value.order === "number" ? value.order : 0,
		section: null,
	};
};

const readTurn = (value: unknown, index: number): QaTurn | string => {
	const field = `history[${index}]`;
	if (!isRecord(value) || !isString(value.question) || !isString(value.answer))
		return `${field} must be { question, answer } strings`;
	if (value.question.length > QA_LIMITS.questionLength)
		return tooLong(`${field}.question`, QA_LIMITS.questionLength);
	if (value.answer.length > QA_LIMITS.historyAnswerLength)
		return tooLong(`${field}.answer`, QA_LIMITS.historyAnswerLength);
	return { question: value.question, answer: value.answer };
};

/** Keeps only the fields the model sees, each within QA_LIMITS. */
export const parseQaRequest = (raw: unknown): ParsedQaRequest => {
	const fail = (error: string): ParsedQaRequest => ({ ok: false, error });
	if (!isRecord(raw))
		return fail("send a JSON object with question and entries");
	const { question, entries, history, unlocked } = raw;
	if (!isString(question) || !question.trim())
		return fail("question must be a non-empty string");
	if (question.length > QA_LIMITS.questionLength)
		return fail(tooLong("question", QA_LIMITS.questionLength));
	if (!isArray(entries)) return fail("entries must be an array of passages");
	if (entries.length > QA_LIMITS.entries)
		return fail(`entries holds more than ${QA_LIMITS.entries} passages`);
	const passages: SearchEntry[] = [];
	for (const [index, value] of entries.entries()) {
		const entry = readEntry(value, index);
		if (isString(entry)) return fail(entry);
		passages.push(entry);
	}

	let turns: QaTurn[] | undefined;
	if (history !== undefined) {
		if (!isArray(history)) return fail("history must be an array");
		if (history.length > QA_LIMITS.historyTurns)
			return fail(`history holds more than ${QA_LIMITS.historyTurns} turns`);
		turns = [];
		for (const [index, value] of history.entries()) {
			const turn = readTurn(value, index);
			if (isString(turn)) return fail(turn);
			turns.push(turn);
		}
	}

	let slugs: string[] | undefined;
	if (unlocked !== undefined) {
		if (
			!isArray(unlocked) ||
			unlocked.length > QA_LIMITS.unlockedSlugs ||
			!unlocked.every(
				(slug) => isString(slug) && slug.length <= QA_LIMITS.slugLength,
			)
		)
			return fail(
				`unlocked must be at most ${QA_LIMITS.unlockedSlugs} slugs of up to ${QA_LIMITS.slugLength} characters`,
			);
		slugs = unlocked as string[];
	}

	return {
		ok: true,
		value: { question, entries: passages, history: turns, unlocked: slugs },
	};
};

export const createQaApiHandlers = (options: {
	provider?: AiQaProviderConfig;
	providers?: AiQaProviderConfig[];
}): { POST: APIRoute } => {
	const providers = resolveProviders(options);

	if (!providers) {
		return {
			POST: async () =>
				jsonResponse(
					{
						error:
							"Q&A provider not configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY, or configure features.aiQaProvider in book.config.ts.",
					},
					503,
				),
		};
	}

	return {
		POST: rateLimited(
			async ({ request }: { request: Request }) => {
				const parsed = await tryParseJsonBody(request, {
					maxBytes: QA_LIMITS.maxBodyBytes,
				});
				if (!parsed.ok) return invalidBodyResponse(parsed);
				const body = parseQaRequest(parsed.value);
				if (!body.ok)
					return jsonResponse(
						{ error: `Invalid request body: ${body.error}.` },
						400,
					);

				const errors: string[] = [];

				for (const provider of providers) {
					const result = await callLlm(provider, body.value);
					if (result) return jsonResponse(result);
					errors.push(
						`${provider.apiKeyEnvVar ?? "provider"}: timeout or error`,
					);
				}

				return jsonResponse(
					{ error: `All Q&A providers failed. ${errors.join("; ")}` },
					502,
				);
			},
			{ perClient: QA_LIMITS.perClient, overall: QA_LIMITS.overall },
		),
	};
};
