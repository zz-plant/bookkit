import { appendBookRecord, bookDataPath } from "../utils/book-data";

export type ReaderAnalyticsEvent = {
	type: "pageview" | "engagement";
	timestamp: number;
	sessionId: string | null;
	path: string | null;
	chapterSlug: string | null;
	version: string | null;
	title?: string | null;
	durationSeconds?: number | null;
	scrollDepth?: number | null;
	referrer?: string | null;
	userAgent?: string | null;
};

export const READER_ANALYTICS_FILE = "reader-analytics.jsonl";

/** This book's reader analytics log (see `utils/book-data.ts`). */
export const getReaderAnalyticsLogPath = (): string =>
	bookDataPath(READER_ANALYTICS_FILE);

export const recordReaderAnalyticsEvent = async (
	payload: ReaderAnalyticsEvent,
): Promise<void> => {
	await appendBookRecord(READER_ANALYTICS_FILE, {
		...payload,
		recordedAt: new Date().toISOString(),
	});
};
