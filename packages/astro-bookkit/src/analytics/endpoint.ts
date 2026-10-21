import { authorOnly } from "../utils/author-token";
import { readBookRecords } from "../utils/book-data";
import {
	invalidBodyResponse,
	jsonResponse,
	quoted,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";
import { isSitePath } from "../utils/links";
import {
	READER_ANALYTICS_FILE,
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

// biome-ignore lint/suspicious/noControlCharactersInRegex: no path or title holds a control character
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
/** Where HTML would start a tag or a comment: `<a`, `</`, `<!`, `<?`. */
const MARKUP = /<[A-Za-z/!?]/;

/**
 * The page's path, or why it is refused. The reader script sends
 * `location.pathname`; the author's dashboard lists it, so it must be a path
 * on this site (see `isSitePath`) and short enough to read.
 */
const pagePath = (value: unknown): { path: string } | { refused: string } => {
	if (typeof value !== "string" || !value.trim()) {
		return {
			refused:
				"path is missing: send the page's path, as location.pathname gives it",
		};
	}
	const path = value.trim();
	if (
		path.length > MAX_PATH_LENGTH ||
		CONTROL_CHARACTER.test(path) ||
		!isSitePath(path)
	) {
		return {
			refused: `path ${quoted(path)} is not a path on this site, which starts with one "/", leads to a page of this site, and has at most ${MAX_PATH_LENGTH} characters`,
		};
	}
	return { path };
};

/**
 * The page's title, cut to `MAX_TITLE_LENGTH`, or why it is refused. The
 * reader script sends `document.title`, which is plain text; one holding
 * markup or a control character did not come from it.
 */
const pageTitle = (
	value: unknown,
): { title: string | null } | { refused: string } => {
	if (value === undefined || value === null) return { title: null };
	if (typeof value !== "string") {
		return { refused: "title must be a string: the page's document.title" };
	}
	const title = value.trim();
	if (CONTROL_CHARACTER.test(title) || MARKUP.test(title)) {
		return {
			refused: `title ${quoted(title)} is not plain text: it holds ${MARKUP.test(title) ? "HTML markup" : "a control character"}`,
		};
	}
	return { title: title ? title.slice(0, MAX_TITLE_LENGTH) : null };
};

/** The event as it is stored, or why it is refused. */
const normalizeEvent = (
	payload: Record<string, unknown>,
	request: Request,
): ReaderAnalyticsEvent | string => {
	if (payload.type !== "pageview" && payload.type !== "engagement") {
		return 'type must be "pageview" or "engagement"';
	}
	const path = pagePath(payload.path);
	if ("refused" in path) return path.refused;
	const title = pageTitle(payload.title);
	if ("refused" in title) return title.refused;

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
		path: path.path,
		chapterSlug: cleanText(payload.chapterSlug, MAX_CHAPTER_LENGTH),
		version: cleanText(payload.version, MAX_VERSION_LENGTH),
		title: title.title,
		durationSeconds,
		scrollDepth,
		referrer: cleanText(request.headers.get("referer"), MAX_PATH_LENGTH),
		userAgent: cleanText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
	};
};

const parseEventsFromLog = (): Promise<ReaderAnalyticsEvent[]> =>
	readBookRecords<ReaderAnalyticsEvent>(READER_ANALYTICS_FILE);

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
				if (typeof event === "string") {
					return jsonResponse(
						{ ok: false, error: `Invalid analytics event: ${event}.` },
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
