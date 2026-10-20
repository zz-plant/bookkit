import { appendBookRecord } from "../utils/book-data";

export type ReleaseEvent = {
	event: "rss_subscribe_click" | "webhook_delivery" | "email_delivery";
	status?: "success" | "failure";
	version?: string;
	/**
	 * A delivery's target: its name, or its URL's scheme and host. Never the
	 * URL itself, whose path or query can be the credential.
	 */
	target?: string;
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
