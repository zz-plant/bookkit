import { authorOnly } from "../utils/author-token";
import { readBookRecords } from "../utils/book-data";
import {
	invalidBodyResponse,
	jsonResponse,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";
import {
	PREVIEW_ANALYTICS_FILE,
	type PreviewAnalyticsEvent,
	recordPreviewEvent,
} from "./analytics";

export type PreviewAnalyticsEndpointOptions = {
	onRecord?: (event: PreviewAnalyticsEvent) => Promise<void> | void;
	onRead?: () => Promise<PreviewAnalyticsEvent[]> | PreviewAnalyticsEvent[];
};

const MAX_TEXT_LENGTH = 240;
const MAX_PATH_LENGTH = 240;
const MAX_HINT_LENGTH = 32;
const MAX_LABEL_LENGTH = 120;
const MAX_BODY_BYTES = 4 * 1024;
const EVENTS_PER_CLIENT_PER_MINUTE = 30;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLength);
};

const normalizeEvent = (
	payload: Record<string, unknown>,
	request: Request,
): PreviewAnalyticsEvent | null => {
	if (payload.type !== "preview") return null;
	const tokenHint = cleanText(payload.tokenHint, MAX_HINT_LENGTH);
	const label = cleanText(payload.label, MAX_LABEL_LENGTH);
	const expiresAt = cleanText(payload.expiresAt, MAX_TEXT_LENGTH);
	const path = cleanText(payload.path, MAX_PATH_LENGTH);
	return {
		type: "preview",
		tokenHint,
		label,
		expiresAt,
		path,
		referrer: cleanText(request.headers.get("referer"), MAX_PATH_LENGTH),
		userAgent: cleanText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
	};
};

const parseEventsFromLog = (): Promise<PreviewAnalyticsEvent[]> =>
	readBookRecords<PreviewAnalyticsEvent>(PREVIEW_ANALYTICS_FILE);

const buildPreviewCounts = (events: PreviewAnalyticsEvent[]) => {
	const counts: Record<string, number> = {};
	const latest: Record<string, string | null> = {};
	events.forEach((event) => {
		const hint = event.tokenHint ?? "unknown";
		counts[hint] = (counts[hint] || 0) + 1;
		const previous = latest[hint];
		if (event.at) {
			latest[hint] =
				previous && new Date(previous).getTime() >= new Date(event.at).getTime()
					? previous
					: event.at;
		}
	});
	return { counts, latest };
};

export const createPreviewAnalyticsEndpoint = (
	options: PreviewAnalyticsEndpointOptions = {},
) => {
	const onRecord = options.onRecord ?? recordPreviewEvent;
	const onRead = options.onRead ?? parseEventsFromLog;

	return {
		// Which preview links were opened, and when: for the author only.
		GET: authorOnly(
			async (_context: { request: Request }) => {
				const events = await onRead();
				const { counts, latest } = buildPreviewCounts(events);
				return jsonResponse({
					ok: true,
					totals: counts,
					latest,
					total: events.length,
				});
			},
			{ route: "GET /api/preview-analytics.json", openInDev: true },
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
						{ ok: false, error: "Invalid preview event." },
						400,
					);
				}

				try {
					await onRecord(event);
				} catch {
					return jsonResponse(
						{ ok: false, error: "Unable to store preview event." },
						500,
					);
				}

				return jsonResponse({ ok: true });
			},
			{ perClient: { limit: EVENTS_PER_CLIENT_PER_MINUTE } },
		),
	};
};
