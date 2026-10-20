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
	apiUrl?: string;
	apiKeyEnvVar?: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	systemPrompt?: string;
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

const callLlm = async (
	provider: AiQaProviderConfig,
	body: QaRequest,
): Promise<QaResponse | null> => {
	const apiUrl = provider.apiUrl ?? DEFAULT_API_URL;
	const apiKeyEnvVar = provider.apiKeyEnvVar ?? "OPENAI_API_KEY";
	const apiKey =
		typeof process !== "undefined" ? process.env[apiKeyEnvVar] : undefined;

	if (!apiKey) return null;

	const model = provider.model ?? DEFAULT_MODEL;
	const maxTokens = provider.maxTokens ?? DEFAULT_MAX_TOKENS;
	const temperature = provider.temperature ?? DEFAULT_TEMPERATURE;
	const systemPrompt = provider.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

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

	let systemPromptText = systemPrompt;
	if (body.unlocked && body.unlocked.length > 0) {
		systemPromptText += ` The reader has only reached the following content: ${body.unlocked.join(", ")}. Use only passages from that content.`;
	}

	let userPrompt = `Question: ${body.question}\n\nBook passages:\n${context}`;

	if (body.history && body.history.length > 0) {
		const historyText = body.history
			.map(
				(turn, i) => `Q${i + 1}: ${turn.question}\nA${i + 1}: ${turn.answer}`,
			)
			.join("\n\n");
		userPrompt = `Conversation so far:\n${historyText}\n\n${userPrompt}`;
	}

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
					{ role: "system", content: systemPromptText },
					{ role: "user", content: userPrompt },
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

		const citations = windowedEntries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			url: entry.url,
		}));

		return { answer, citations };
	} catch {
		return null;
	}
};

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
							"Q&A provider not configured. Set OPENAI_API_KEY or GROQ_API_KEY, or configure features.aiQaProvider in book.config.ts.",
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
