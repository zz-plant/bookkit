import type { AnalyticsDashboardEvent, ComparisonPeriods } from "./types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const toDateAtStartOfDay = (value: string | Date): Date => {
	const date = new Date(typeof value === "string" ? value : value.getTime());
	date.setHours(0, 0, 0, 0);
	return date;
};

export const toDateAtEndOfDay = (value: string | Date): Date => {
	const date = new Date(typeof value === "string" ? value : value.getTime());
	date.setHours(23, 59, 59, 999);
	return date;
};

export const createPeriodComparison = (
	start: string | Date,
	end: string | Date,
): ComparisonPeriods => {
	const startDate = toDateAtStartOfDay(start);
	const endDate = toDateAtEndOfDay(end);
	const rangeDuration = Math.max(
		endDate.getTime() - startDate.getTime() + 1,
		DAY_IN_MS,
	);
	const priorEnd = new Date(startDate.getTime() - 1);
	const priorStart = new Date(priorEnd.getTime() - rangeDuration + 1);

	return { startDate, endDate, priorStart, priorEnd, rangeDuration };
};

export const filterEventsForPeriod = (
	events: AnalyticsDashboardEvent[],
	startDate: Date,
	endDate: Date,
	selectedVersion = "all",
): AnalyticsDashboardEvent[] =>
	events.filter((event) => {
		const inRange =
			event.timestamp >= startDate.getTime() &&
			event.timestamp <= endDate.getTime();
		const inVersion =
			selectedVersion === "all" || event.version === selectedVersion;
		return inRange && inVersion;
	});

export const byDayKey = (timestamp: number): string =>
	new Date(timestamp).toISOString().slice(0, 10);

export const buildDailySeries = (
	events: AnalyticsDashboardEvent[],
	valueSelector: (event: AnalyticsDashboardEvent) => number,
): number[] => {
	const map = new Map<string, number>();

	events.forEach((event) => {
		const day = byDayKey(event.timestamp);
		map.set(day, (map.get(day) ?? 0) + valueSelector(event));
	});

	return Array.from(map.entries())
		.sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
		.map(([, total]) => total);
};
