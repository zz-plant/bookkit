import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const logPath = join(tmpdir(), "bookkit-preview-analytics.jsonl");

export const recordPreviewEvent = async (
	payload: PreviewAnalyticsEvent,
): Promise<void> => {
	const entry = {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	};
	try {
		await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
	} catch (error) {
		console.warn("Preview analytics log failed", error);
	}
};

export const getPreviewAnalyticsLogPath = (): string => logPath;
