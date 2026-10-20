import { appendBookRecord } from "../utils/book-data";

export type ExportAnalyticsEvent = {
	type: "download";
	format?: string | null;
	scope?: "book" | "chapter" | null;
	slug?: string | null;
	href?: string | null;
	path?: string | null;
	referrer?: string | null;
	userAgent?: string | null;
	at?: string;
	metadata?: Record<string, string>;
};

export const recordExportEvent = async (
	payload: ExportAnalyticsEvent,
): Promise<void> => {
	await appendBookRecord("export-analytics.jsonl", {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	});
};
