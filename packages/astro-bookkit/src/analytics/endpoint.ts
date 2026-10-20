import { readFile } from "node:fs/promises";
import { authorOnly } from "../utils/author-token";
import {
	invalidBodyResponse,
	jsonResponse,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";
import {
	getReaderAnalyticsLogPath,
	type ReaderAnalyticsEvent,
	recordReaderAnalyticsEvent,
} from "./analytics";

export type ReaderAnalyticsEndpointOptions = {
	onRecord?: (event: ReaderAnalyticsEvent) => Promise<void> | void;
	onRead?: () => Promise<ReaderAnalyticsEvent[]> | ReaderAnalyticsEvent[];
};

const MAX_TEXT_LENGTH = 240;
const MAX_PATH_LENGTH = 240;
const MAX_TITLE_LENGTH = 160;
const MAX_SESSION_LENGTH = 80;
const MAX_VERSION_LENGTH = 40;
const MAX_CHAPTER_LENGTH = 120;
/** One event is well under 1 KB; anything larger is not from the reader script. */
const MAX_BODY_BYTES = 4 * 1024;
/** A reader sends a page view and an engagement event per page. */
const EVENTS_PER_CLIENT_PER_MINUTE = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLength);
};

const clampNumber = (value: unknown, min: number, max: number) => {
	if (typeof value !== "number" || Number.isNaN(value)) return null;
	return Math.min(max, Math.max(min, value));
};

const normalizeTimestamp = (value: unknown): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return Date.now();
};

const normalizeEvent = (
	payload: Record<string, unknown>,
	request: Request,
): ReaderAnalyticsEvent | null => {
	if (payload.type !== "pageview" && payload.type !== "engagement") return null;

	const timestamp = normalizeTimestamp(payload.timestamp);
	const durationSeconds =
		payload.type === "engagement"
			? clampNumber(payload.durationSeconds, 0, 60 * 60)
			: null;
	const scrollDepth =
		payload.type === "engagement"
			? clampNumber(payload.scrollDepth, 0, 1)
			: null;

	return {
		type: payload.type,
		timestamp,
		sessionId: cleanText(payload.sessionId, MAX_SESSION_LENGTH),
		path: cleanText(payload.path, MAX_PATH_LENGTH),
		chapterSlug: cleanText(payload.chapterSlug, MAX_CHAPTER_LENGTH),
		version: cleanText(payload.version, MAX_VERSION_LENGTH),
		title: cleanText(payload.title, MAX_TITLE_LENGTH),
		durationSeconds,
		scrollDepth,
		referrer: cleanText(request.headers.get("referer"), MAX_PATH_LENGTH),
		userAgent: cleanText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
	};
};

const parseEventsFromLog = async (): Promise<ReaderAnalyticsEvent[]> => {
	try {
		const log = await readFile(getReaderAnalyticsLogPath(), "utf8");
		return log
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line) as ReaderAnalyticsEvent;
				} catch {
					return null;
				}
			})
			.filter((entry): entry is ReaderAnalyticsEvent => Boolean(entry));
	} catch {
		return [];
	}
};

const filterByQuery = (events: ReaderAnalyticsEvent[], request: Request) => {
	const { searchParams } = new URL(request.url);
	const version = searchParams.get("version");
	const start = searchParams.get("start");
	const end = searchParams.get("end");
	const startMs = start ? Date.parse(start) : null;
	const endMs = end ? Date.parse(end) : null;
	const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
	return events.filter((event) => {
		if (event.timestamp < cutoff) return false;
		if (version && event.version !== version) return false;
		if (startMs && event.timestamp < startMs) return false;
		if (endMs && event.timestamp > endMs) return false;
		return true;
	});
};

export const createReaderAnalyticsEndpoint = (
	options: ReaderAnalyticsEndpointOptions = {},
) => {
	const onRecord = options.onRecord ?? recordReaderAnalyticsEvent;
	const onRead = options.onRead ?? parseEventsFromLog;

	return {
		// Readers' sessions, paths, and user agents: for the author only.
		GET: authorOnly(
			async ({ request }: { request: Request }) => {
				const events = await onRead();
				const filtered = filterByQuery(events, request);
				return jsonResponse({
					ok: true,
					total: filtered.length,
					events: filtered,
				});
			},
			{ route: "GET /api/analytics.json", openInDev: true },
		),
		POST: rateLimited(
			async ({ request }: { request: Request }) => {
				const parsed = await tryParseJsonBody(request, {
					maxBytes: MAX_BODY_BYTES,
				});
				if (!parsed.ok) return invalidBodyResponse(parsed);
				const payload = parsed.value;

				if (!isRecord(payload)) {
					return jsonResponse({ ok: false, error: "Invalid payload." }, 400);
				}

				const event = normalizeEvent(payload, request);
				if (!event) {
					return jsonResponse(
						{ ok: false, error: "Invalid analytics event." },
						400,
					);
				}

				try {
					await onRecord(event);
				} catch {
					return jsonResponse(
						{ ok: false, error: "Unable to store analytics event." },
						500,
					);
				}

				return jsonResponse({ ok: true });
			},
			{ perClient: { limit: EVENTS_PER_CLIENT_PER_MINUTE } },
		),
	};
};
