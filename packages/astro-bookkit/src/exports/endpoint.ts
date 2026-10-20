import {
	invalidBodyResponse,
	jsonResponse,
	rateLimited,
	tryParseJsonBody,
} from "../utils/http";
import { type ExportAnalyticsEvent, recordExportEvent } from "./analytics";

export type ExportAnalyticsEndpointOptions = {
	onRecord?: (event: ExportAnalyticsEvent) => Promise<void> | void;
};

const MAX_TEXT_LENGTH = 240;
const MAX_SLUG_LENGTH = 200;
const MAX_PATH_LENGTH = 240;
const MAX_HREF_LENGTH = 320;
const MAX_METADATA_VALUE_LENGTH = 200;
const MAX_METADATA_ENTRIES = 10;
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

const normalizeScope = (value: unknown): "book" | "chapter" | null => {
	if (value === "book" || value === "chapter") return value;
	return null;
};

const normalizeMetadata = (
	value: unknown,
): Record<string, string> | undefined => {
	if (!isRecord(value)) return undefined;
	const entries = Object.entries(value)
		.slice(0, MAX_METADATA_ENTRIES)
		.map(([key, raw]) => {
			const cleanedKey = cleanText(key, 80);
			const cleanedValue = cleanText(raw, MAX_METADATA_VALUE_LENGTH);
			if (!cleanedKey || !cleanedValue) return null;
			return [cleanedKey, cleanedValue] as const;
		})
		.filter((entry): entry is readonly [string, string] => entry !== null);
	return entries.length ? Object.fromEntries(entries) : undefined;
};

const normalizeEvent = (
	payload: Record<string, unknown>,
	request: Request,
): ExportAnalyticsEvent | null => {
	if (payload.type !== "download") return null;
	const format = cleanText(payload.format, 16);
	const scope = normalizeScope(payload.scope);
	const slug = cleanText(payload.slug, MAX_SLUG_LENGTH);
	const href = cleanText(payload.href, MAX_HREF_LENGTH);
	const path = cleanText(payload.path, MAX_PATH_LENGTH);
	return {
		type: "download",
		format,
		scope,
		slug,
		href,
		path,
		referrer: cleanText(request.headers.get("referer"), MAX_HREF_LENGTH),
		userAgent: cleanText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
		metadata: normalizeMetadata(payload.metadata),
	};
};

export const createExportAnalyticsEndpoint = (
	options: ExportAnalyticsEndpointOptions = {},
) => {
	const onRecord = options.onRecord ?? recordExportEvent;

	return {
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
						{ ok: false, error: "Invalid export event." },
						400,
					);
				}

				try {
					await onRecord(event);
				} catch {
					return jsonResponse(
						{ ok: false, error: "Unable to store export event." },
						500,
					);
				}

				return jsonResponse({ ok: true });
			},
			{ perClient: { limit: EVENTS_PER_CLIENT_PER_MINUTE } },
		),
	};
};
