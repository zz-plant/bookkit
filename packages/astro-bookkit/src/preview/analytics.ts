import { appendBookRecord, bookDataPath } from "../utils/book-data";

export type PreviewAnalyticsEvent = {
	type: "preview";
	tokenHint?: string | null;
	label?: string | null;
	expiresAt?: string | null;
	path?: string | null;
	referrer?: string | null;
	userAgent?: string | null;
	at?: string;
};

export const PREVIEW_ANALYTICS_FILE = "preview-analytics.jsonl";

export const recordPreviewEvent = async (
	payload: PreviewAnalyticsEvent,
): Promise<void> => {
	await appendBookRecord(PREVIEW_ANALYTICS_FILE, {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	});
};

/** This book's preview-link log (see `utils/book-data.ts`). */
export const getPreviewAnalyticsLogPath = (): string =>
	bookDataPath(PREVIEW_ANALYTICS_FILE);
