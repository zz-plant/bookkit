import type { AnalyticsDashboardEvent } from "./types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const toNullableString = (value: unknown): string | null =>
	typeof value === "string" ? value : null;

const toNullableNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

export const normalizeAnalyticsEvent = (
	value: unknown,
): AnalyticsDashboardEvent | null => {
	if (!isRecord(value)) return null;
	if (value.type !== "pageview" && value.type !== "engagement") return null;
	if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp))
		return null;

	return {
		type: value.type,
		timestamp: value.timestamp,
		sessionId: toNullableString(value.sessionId),
		path: toNullableString(value.path),
		chapterSlug: toNullableString(value.chapterSlug),
		version: toNullableString(value.version),
		title: toNullableString(value.title),
		durationSeconds: toNullableNumber(value.durationSeconds),
		scrollDepth: toNullableNumber(value.scrollDepth),
		referrer: toNullableString(value.referrer),
		userAgent: toNullableString(value.userAgent),
		locale: toNullableString(value.locale),
	};
};

export const filterEventsByRetention = (
	events: AnalyticsDashboardEvent[],
	options: { now?: number; retentionDays?: number } = {},
): AnalyticsDashboardEvent[] => {
	const now = options.now ?? Date.now();
	const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
	const cutoff = now - retentionDays * DAY_IN_MS;
	return events.filter((event) => event.timestamp >= cutoff);
};

export const parseStoredAnalyticsEvents = (
	stored: string | null,
	options: { now?: number; retentionDays?: number } = {},
): AnalyticsDashboardEvent[] => {
	if (!stored) return [];

	try {
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];

		const normalized = parsed
			.map((event) => normalizeAnalyticsEvent(event))
			.filter((event): event is AnalyticsDashboardEvent => Boolean(event));

		return filterEventsByRetention(normalized, options);
	} catch {
		return [];
	}
};
