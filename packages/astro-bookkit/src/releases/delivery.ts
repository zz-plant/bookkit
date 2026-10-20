import { type ReleaseEvent, recordReleaseEvent } from "./analytics";

/** What the webhook and email targets have in common. */
export type DeliveryTarget = {
	url: string;
	name?: string;
	secret?: string;
	headers?: Record<string, string>;
};

export type DeliveryResult<T extends DeliveryTarget> = {
	target: T;
	status: "success" | "failure";
	statusCode?: number;
	/** Why it failed, with the target's URL replaced by its label. */
	error?: string;
};

/**
 * How a target is named outside the request that delivers to it: in the
 * release log, in the endpoint's answer, and in error messages. A Slack-style
 * webhook URL is a credential (its path is the token), so the label is the
 * target's `name`, or its URL's scheme and host, never its path, query, or
 * user info.
 */
export const deliveryTargetLabel = (target: {
	url: string;
	name?: string;
}): string => {
	if (target.name) return target.name;
	try {
		const { protocol, host } = new URL(target.url);
		if (host) return `${protocol}//${host}`;
	} catch {
		// Not a URL: nothing in it can be shown.
	}
	return "unnamed target";
};

/**
 * `message` with the target's URL replaced by its label, wherever a runtime
 * echoed it: as configured, as parsed, or only its path and query (Node's
 * fetch writes `Failed to parse URL from <url>`).
 */
export const withoutTargetUrl = (
	message: string,
	target: { url: string; name?: string },
): string => {
	const forms = new Set([target.url, target.url.trim()]);
	try {
		const parsed = new URL(target.url.trim());
		forms.add(parsed.href);
		const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
		if (rest.length > 1) forms.add(rest);
	} catch {
		// Only the forms as configured.
	}
	const label = deliveryTargetLabel(target);
	return [...forms]
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)
		.reduce((text, form) => text.split(form).join(label), message);
};

const deliveryHeaders = (target: DeliveryTarget) => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "astro-bookkit",
		...target.headers,
	};
	if (target.secret) {
		headers["X-Bookkit-Webhook-Token"] = target.secret;
	}
	return headers;
};

/** POSTs `payload` to one target and records the outcome in the release log. */
export const deliverRelease = async <T extends DeliveryTarget>({
	event,
	target,
	payload,
	version,
	metadata,
}: {
	event: Extract<ReleaseEvent["event"], `${string}_delivery`>;
	target: T;
	payload: unknown;
	version: string;
	metadata?: Record<string, string>;
}): Promise<DeliveryResult<T>> => {
	const label = deliveryTargetLabel(target);
	try {
		const response = await fetch(target.url, {
			method: "POST",
			headers: deliveryHeaders(target),
			body: JSON.stringify(payload),
		});
		const status = response.ok ? "success" : "failure";
		await recordReleaseEvent({
			event,
			status,
			version,
			target: label,
			metadata,
		});
		return {
			target,
			status,
			statusCode: response.status,
			error: response.ok ? undefined : `HTTP ${response.status}`,
		};
	} catch (error) {
		const message = withoutTargetUrl(
			error instanceof Error ? error.message : "Unknown error",
			target,
		);
		await recordReleaseEvent({
			event,
			status: "failure",
			version,
			target: label,
			metadata: { ...metadata, error: message },
		});
		return { target, status: "failure", error: message };
	}
};
