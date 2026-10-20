import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { authorOnly } from "../utils/author-token";
import {
	appendRecords,
	bookDataDir,
	bookDataPath,
	readRecords,
} from "../utils/book-data";
import {
	invalidBodyResponse,
	jsonResponse,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";

export type FeedbackEvent = {
	id: string;
	eventType: "impression" | "feedback";
	timestamp: number;
	slug: string;
	title?: string | null;
	contentType?: string | null;
	version?: string | null;
	responseType?: string | null;
	emoji?: string | null;
	comment?: string | null;
};

export type FeedbackEndpointOptions = {
	/**
	 * A JSON-lines file, one event per line, which POST only appends to.
	 * Default: `feedback-events.jsonl` in the book's data folder (see
	 * `utils/book-data.ts`).
	 */
	storagePath?: string;
	/** GET reads the newest this many events (default 2000). */
	maxEvents?: number;
};

const MAX_COMMENT_LENGTH = 240;
const MAX_TITLE_LENGTH = 160;
const MAX_SLUG_LENGTH = 200;
const MAX_EMOJI_LENGTH = 16;
const MAX_EVENT_AGE_MS = 1000 * 60 * 60 * 24 * 7;
/**
 * The widget sends one event at a time. Without a cap, one request could push
 * every stored event out of the `maxEvents` window.
 */
const MAX_EVENTS_PER_REQUEST = 20;
const MAX_BODY_BYTES = 16 * 1024;
const REQUESTS_PER_CLIENT_PER_MINUTE = 30;

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const cleanText = (value: unknown, maxLength: number) => {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return trimmed.slice(0, maxLength);
};

const sanitizeComment = (value: unknown) => {
	if (typeof value !== "string") return undefined;
	return (
		value
			.replace(/https?:\/\/\S+/gi, "")
			.replace(/www\.\S+/gi, "")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization of ascii control characters
			.replace(/[\u0000-\u001F\u007F]+/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, MAX_COMMENT_LENGTH)
	);
};

const normalizeTimestamp = (value: unknown) => {
	const numeric = typeof value === "number" ? value : undefined;
	const now = Date.now();
	if (!numeric) return now;
	if (Math.abs(now - numeric) > MAX_EVENT_AGE_MS) return now;
	return numeric;
};

const normalizeEvent = (
	payload: Record<string, unknown>,
): FeedbackEvent | null => {
	const eventType =
		payload.eventType === "feedback" || payload.eventType === "impression"
			? payload.eventType
			: null;
	const slug = cleanText(payload.slug, MAX_SLUG_LENGTH);
	if (!eventType || !slug) return null;

	return {
		id:
			cleanText(payload.id, 80) ??
			`feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		eventType,
		timestamp: normalizeTimestamp(payload.timestamp),
		slug,
		title: cleanText(payload.title, MAX_TITLE_LENGTH) ?? null,
		contentType: cleanText(payload.contentType, 80) ?? null,
		version: cleanText(payload.version, 40) ?? null,
		responseType: cleanText(payload.responseType, 40) ?? null,
		emoji: cleanText(payload.emoji, MAX_EMOJI_LENGTH) ?? null,
		comment: sanitizeComment(payload.comment) ?? null,
	};
};

const parsePayload = (payload: unknown): FeedbackEvent[] => {
	if (!payload) return [];
	if (isRecord(payload)) {
		if (Array.isArray(payload.events)) {
			if (payload.events.length > MAX_EVENTS_PER_REQUEST) return [];
			return payload.events
				.map((event) => (isRecord(event) ? normalizeEvent(event) : null))
				.filter((event): event is FeedbackEvent => Boolean(event));
		}
		const normalized = normalizeEvent(payload);
		return normalized ? [normalized] : [];
	}
	return [];
};

const clampNumber = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const parseNumber = (value: string | null) => {
	if (!value) return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Feedback kept before it moved to JSON lines: one JSON array, which each
 * POST read and wrote back whole, so two at once could lose one. Read, never
 * written.
 */
const LEGACY_FEEDBACK_FILE = "feedback-events.json";

const loadLegacyEvents = async (): Promise<FeedbackEvent[]> => {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(join(bookDataDir(), LEGACY_FEEDBACK_FILE), "utf8"),
		);
		return Array.isArray(parsed) ? (parsed as FeedbackEvent[]) : [];
	} catch {
		return [];
	}
};

export const createFeedbackEndpoint = (
	options: FeedbackEndpointOptions = {},
) => {
	// Resolved per request, so the server's BOOKKIT_DATA_DIR applies.
	const storagePath = () =>
		options.storagePath ?? bookDataPath("feedback-events.jsonl");
	const maxEvents = options.maxEvents ?? 2000;
	const loadEvents = async () =>
		[
			...(options.storagePath ? [] : await loadLegacyEvents()),
			...(await readRecords<FeedbackEvent>(storagePath())),
		].slice(-maxEvents);

	return {
		// Readers' comments: for the author only.
		GET: authorOnly(
			async ({ request }: { request: Request }) => {
				const url = new URL(request.url);
				const limitParam = parseNumber(url.searchParams.get("limit"));
				const sinceParam = parseNumber(url.searchParams.get("since"));
				const untilParam = parseNumber(url.searchParams.get("until"));
				const slugParam = cleanText(
					url.searchParams.get("slug"),
					MAX_SLUG_LENGTH,
				);

				const limit = clampNumber(limitParam ?? maxEvents, 1, maxEvents);
				const since = sinceParam ?? 0;
				const until = untilParam ?? Date.now();

				const storedEvents = await loadEvents();
				const filtered = storedEvents.filter((event) => {
					if (event.timestamp < since || event.timestamp > until) return false;
					if (slugParam && event.slug !== slugParam) return false;
					return true;
				});

				return jsonResponse({ ok: true, events: filtered.slice(-limit) });
			},
			{ route: "GET /api/feedback.json", openInDev: true },
		),
		POST: rateLimited(
			async ({ request }: { request: Request }) => {
				const parsed = await tryParseJsonBody(request, {
					maxBytes: MAX_BODY_BYTES,
				});
				if (!parsed.ok) return invalidBodyResponse(parsed);

				const events = parsePayload(parsed.value);
				if (!events.length) {
					return jsonResponse(
						{
							ok: false,
							error: `Invalid feedback payload: send one event, or { events: [...] } with at most ${MAX_EVENTS_PER_REQUEST}, each with eventType "feedback" or "impression" and a slug.`,
						},
						400,
					);
				}

				if (!(await appendRecords(storagePath(), events))) {
					return jsonResponse(
						{ ok: false, error: "Unable to store feedback." },
						500,
					);
				}

				return jsonResponse({ ok: true, stored: events.length });
			},
			{ perClient: { limit: REQUESTS_PER_CLIENT_PER_MINUTE } },
		),
	};
};
