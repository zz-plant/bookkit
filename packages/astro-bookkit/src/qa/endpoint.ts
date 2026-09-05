import type { APIRoute } from "astro";
import type { SearchEntry } from "../search";

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

export const createQaApiHandlers = (options: {
	provider?: AiQaProviderConfig;
	providers?: AiQaProviderConfig[];
}): { POST: APIRoute } => {
	const providers = resolveProviders(options);

	if (!providers) {
		return {
			POST: async () =>
				new Response(
					JSON.stringify({
						error:
							"Q&A provider not configured. Set OPENAI_API_KEY or GROQ_API_KEY, or configure features.aiQaProvider in book.config.ts.",
					}),
					{
						status: 503,
						headers: { "Content-Type": "application/json" },
					},
				),
		};
	}

	return {
		POST: async ({ request }) => {
			let body: QaRequest;
			try {
				const raw = await request.json();
				if (
					!isRecord(raw) ||
					!isString(raw.question) ||
					!isArray(raw.entries)
				) {
					return new Response(
						JSON.stringify({ error: "Invalid request body" }),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				body = raw as QaRequest;
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			const errors: string[] = [];

			for (const provider of providers) {
				const result = await callLlm(provider, body);
				if (result) {
					return new Response(JSON.stringify(result), {
						headers: { "Content-Type": "application/json" },
					});
				}
				errors.push(`${provider.apiKeyEnvVar ?? "provider"}: timeout or error`);
			}

			return new Response(
				JSON.stringify({
					error: `All Q&A providers failed. ${errors.join("; ")}`,
				}),
				{
					status: 502,
					headers: { "Content-Type": "application/json" },
				},
			);
		},
	};
};
