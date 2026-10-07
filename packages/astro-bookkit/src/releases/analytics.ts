import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ReleaseEvent = {
	event: "rss_subscribe_click" | "webhook_delivery" | "email_delivery";
	status?: "success" | "failure";
	version?: string;
	webhook?: string;
	metadata?: Record<string, string>;
	at?: string;
};

const logPath = join(tmpdir(), "bookkit-release-analytics.jsonl");

export const recordReleaseEvent = async (
	payload: ReleaseEvent,
): Promise<void> => {
	const entry = {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	};
	try {
		await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
	} catch (error) {
		console.warn("Release analytics log failed", error);
	}
};
