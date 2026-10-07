import { readFile } from "node:fs/promises";
import { jsonResponse, parseJsonBody } from "../utils/http";
import {
	getPreviewAnalyticsLogPath,
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

const parseEventsFromLog = async (): Promise<PreviewAnalyticsEvent[]> => {
	try {
		const log = await readFile(getPreviewAnalyticsLogPath(), "utf8");
		return log
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line) as PreviewAnalyticsEvent;
				} catch (error) {
					return null;
				}
			})
			.filter((entry): entry is PreviewAnalyticsEvent => Boolean(entry));
	} catch (error) {
		return [];
	}
};

const buildPreviewCounts = (events: PreviewAnalyticsEvent[]) => {
	const counts: Record<string, number> = {};
	const latest: Record<string, string | null> = {};
	events.forEach((event) => {
		const hint = event.tokenHint ?? "unknown";
		counts[hint] = (counts[hint] || 0) + 1;
		if (event.at) {
			latest[hint] = latest[hint]
				? new Date(latest[hint]!).getTime() < new Date(event.at).getTime()
					? event.at
					: latest[hint]
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
		GET: async () => {
			const events = await onRead();
			const { counts, latest } = buildPreviewCounts(events);
			return jsonResponse({
				ok: true,
				totals: counts,
				latest,
				total: events.length,
			});
		},
		POST: async ({ request }: { request: Request }) => {
			const payload = await parseJsonBody(request);

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
			} catch (error) {
				return jsonResponse(
					{ ok: false, error: "Unable to store preview event." },
					500,
				);
			}

			return jsonResponse({ ok: true });
		},
	};
};
