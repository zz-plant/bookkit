import { appendBookRecord } from "../utils/book-data";

export type ReleaseEvent = {
	event: "rss_subscribe_click" | "webhook_delivery" | "email_delivery";
	status?: "success" | "failure";
	version?: string;
	webhook?: string;
	metadata?: Record<string, string>;
	at?: string;
};

export const recordReleaseEvent = async (
	payload: ReleaseEvent,
): Promise<void> => {
	await appendBookRecord("release-analytics.jsonl", {
		...payload,
		at: payload.at ?? new Date().toISOString(),
	});
};
