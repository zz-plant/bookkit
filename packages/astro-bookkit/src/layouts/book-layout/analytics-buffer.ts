import { readStoredJson, type StorageLike, writeStoredJson } from "./storage";

export const createBufferedTracker = <T extends Record<string, unknown>>(
	storage: StorageLike,
	storageKey: string,
	eventName: string,
) => {
	let queue: Array<T & { ts: number }> = [];
	let flushTimer: number | null = null;

	const flush = () => {
		flushTimer = null;
		if (!queue.length) return;
		const pending = queue;
		queue = [];

		const existing =
			readStoredJson<Array<T & { ts: number }>>(storage, storageKey) ?? [];
		const merged = Array.isArray(existing) ? existing.concat(pending) : pending;
		writeStoredJson(storage, storageKey, merged.slice(-120));
		for (const event of pending) {
			window.dispatchEvent(new CustomEvent(eventName, { detail: event }));
		}
	};

	window.addEventListener("beforeunload", flush);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			flush();
		}
	});

	return (payload: T) => {
		queue.push({ ...payload, ts: Date.now() });
		if (flushTimer !== null) return;
		flushTimer = window.setTimeout(flush, 200);
	};
};

export const sendJsonBeacon = (
	endpoint: string | null | undefined,
	payload: unknown,
): void => {
	if (!endpoint) return;
	const body = JSON.stringify(payload);
	if ("sendBeacon" in navigator) {
		const blob = new Blob([body], { type: "application/json" });
		navigator.sendBeacon(endpoint, blob);
		return;
	}
	fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		keepalive: true,
	}).catch(() => {});
};
