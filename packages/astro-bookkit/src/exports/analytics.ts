import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const logPath = join(tmpdir(), "bookkit-export-analytics.jsonl");

export const recordExportEvent = async (
	payload: ExportAnalyticsEvent,
): Promise<void> => {
	const entry = {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	};
	try {
		await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
	} catch (error) {
		console.warn("Export analytics log failed", error);
	}
};
