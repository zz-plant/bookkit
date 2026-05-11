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

const LLM_TIMEOUT_MS = 30_000;

const isString = (value: unknown): value is string => typeof value === "string";
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createQaApiHandlers = (options: {
  provider?: AiQaProviderConfig;
}): { POST: APIRoute } => {
  const provider = options.provider;

  if (!provider) {
    return {
      POST: async () =>
        new Response(JSON.stringify({ error: "Q&A provider not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    };
  }

  const apiUrl = provider.apiUrl ?? DEFAULT_API_URL;
  const apiKeyEnvVar = provider.apiKeyEnvVar ?? "OPENAI_API_KEY";
  const apiKey = typeof process !== "undefined" ? process.env[apiKeyEnvVar] : undefined;
  const model = provider.model ?? DEFAULT_MODEL;
  const maxTokens = provider.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = provider.temperature ?? DEFAULT_TEMPERATURE;
  const systemPrompt = provider.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  return {
    POST: async ({ request }) => {
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "API key not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      let body: QaRequest;
      try {
        const raw = await request.json();
        if (!isRecord(raw) || !isString(raw.question) || !isArray(raw.entries)) {
          return new Response(JSON.stringify({ error: "Invalid request body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        body = raw as QaRequest;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const context = body.entries
        .map((entry, i) => `[${i + 1}] ${entry.title} (${entry.context})\n${entry.snippet}`)
        .join("\n\n");

      const userPrompt = `Question: ${body.question}\n\nBook passages:\n${context}`;

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
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: maxTokens,
            temperature,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(JSON.stringify({ error: `LLM API error: ${errorText}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const answer = data.choices?.[0]?.message?.content?.trim() ?? "No response from model.";

        const citations = body.entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          url: entry.url,
        }));

        return new Response(JSON.stringify({ answer, citations } satisfies QaResponse), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: `Request failed: ${message}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  };
};
