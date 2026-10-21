import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { chapterSchema } from "../schemas/chapter";
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
	quoted,
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

/**
 * What the feedback widget (`components/FeedbackWidget.astro`) sends as a
 * reaction: a vote, or one of its emoji. The endpoint stores no other, so
 * what reaches the author's dashboard is one of these or nothing.
 */
export const FEEDBACK_RESPONSES = ["helpful", "not_helpful", "emoji"] as const;
export const FEEDBACK_EMOJI = ["😀", "🤔", "😕", "🔥"] as const;

const MAX_COMMENT_LENGTH = 240;
const MAX_TITLE_LENGTH = 160;
const MAX_SLUG_LENGTH = 200;
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

/** A string field, trimmed; null when it is missing, empty, or not a string. */
const trimmedText = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;

const isOneOf = <T extends string>(
	values: readonly T[],
	value: string,
): value is T => (values as readonly string[]).includes(value);

/**
 * The event as it is stored, or why it is refused. The slug must be a
 * page's, as the content schemas write slugs, and a reaction one the widget
 * offers: the dashboard shows both to the author. Other text is trimmed and
 * cut to length.
 */
const normalizeEvent = (
	payload: Record<string, unknown>,
): FeedbackEvent | string => {
	const eventType =
		payload.eventType === "feedback" || payload.eventType === "impression"
			? payload.eventType
			: null;
	if (!eventType) return 'eventType must be "feedback" or "impression"';
	const slug = trimmedText(payload.slug);
	if (!slug) return "slug is missing: send the slug of the page being read";
	if (
		slug.length > MAX_SLUG_LENGTH ||
		!chapterSchema.shape.slug.safeParse(slug).success
	) {
		return `slug ${quoted(slug)} is not a page's slug, which has only lowercase letters, digits, and hyphens, and at most ${MAX_SLUG_LENGTH} of them`;
	}
	const responseType = trimmedText(payload.responseType);
	if (responseType && !isOneOf(FEEDBACK_RESPONSES, responseType)) {
		return `responseType ${quoted(responseType)} is not one of ${FEEDBACK_RESPONSES.join(", ")}`;
	}
	const emoji = trimmedText(payload.emoji);
	if (emoji && !isOneOf(FEEDBACK_EMOJI, emoji)) {
		return `emoji ${quoted(emoji)} is not one the widget offers: ${FEEDBACK_EMOJI.join(" ")}`;
	}
	if (responseType === "emoji" && !emoji) {
		return `responseType "emoji" needs an emoji: one of ${FEEDBACK_EMOJI.join(" ")}`;
	}

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
		responseType,
		emoji,
		comment: sanitizeComment(payload.comment) ?? null,
	};
};

/** The events a request sends that can be stored, and why each other one is refused. */
const parsePayload = (
	payload: unknown,
): { events: FeedbackEvent[]; refused: string[] } => {
	if (!isRecord(payload)) {
		return { events: [], refused: ["the body is not a JSON object"] };
	}
	if (!Array.isArray(payload.events)) {
		const event = normalizeEvent(payload);
		return typeof event === "string"
			? { events: [], refused: [event] }
			: { events: [event], refused: [] };
	}
	if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
		return {
			events: [],
			refused: [
				`events holds ${payload.events.length} events, more than ${MAX_EVENTS_PER_REQUEST}`,
			],
		};
	}
	const events: FeedbackEvent[] = [];
	const refused: string[] = [];
	payload.events.forEach((value, index) => {
		const event = isRecord(value)
			? normalizeEvent(value)
			: "the event is not a JSON object";
		if (typeof event === "string") refused.push(`events[${index}]: ${event}`);
		else events.push(event);
	});
	return { events, refused };
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

				const { events, refused } = parsePayload(parsed.value);
				if (!events.length) {
					return jsonResponse(
						{
							ok: false,
							error: `Invalid feedback payload: ${refused[0] ?? "events is empty"}. Send one event, or { events: [...] } with at most ${MAX_EVENTS_PER_REQUEST}, each with eventType "feedback" or "impression" and the page's slug.`,
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
