import { describe, expect, it } from "bun:test";

import {
	aggregateChapterMetrics,
	aggregateLocaleMetrics,
	aggregateVersionMetrics,
	summarizeAnalyticsEvents,
} from "./dashboard/aggregation";
import {
	createSparklinePoints,
	formatMetricDelta,
} from "./dashboard/formatting";
import {
	filterEventsByRetention,
	normalizeAnalyticsEvent,
	parseStoredAnalyticsEvents,
} from "./dashboard/parsing";
import {
	createPeriodComparison,
	filterEventsForPeriod,
} from "./dashboard/periods";
import type { AnalyticsDashboardEvent } from "./dashboard/types";

const day = (value: string): number => new Date(value).getTime();

const pageview = (
	overrides: Partial<AnalyticsDashboardEvent> = {},
): AnalyticsDashboardEvent => ({
	type: "pageview",
	timestamp: day("2026-03-10T12:00:00.000Z"),
	sessionId: null,
	path: "/read/test",
	chapterSlug: "chapter-one",
	version: "v1",
	title: null,
	durationSeconds: null,
	scrollDepth: null,
	referrer: null,
	userAgent: null,
	locale: "en",
	...overrides,
});

const engagement = (
	overrides: Partial<AnalyticsDashboardEvent> = {},
): AnalyticsDashboardEvent => ({
	...pageview({
		type: "engagement",
		durationSeconds: 45,
		scrollDepth: 0.6,
		...overrides,
	}),
	type: "engagement",
	durationSeconds: overrides.durationSeconds ?? 45,
	scrollDepth: overrides.scrollDepth ?? 0.6,
});

describe("analytics dashboard parsing helpers", () => {
	it("normalizes valid events and rejects invalid payloads", () => {
		expect(normalizeAnalyticsEvent(pageview())).toEqual(pageview());
		expect(
			normalizeAnalyticsEvent({ type: "unknown", timestamp: Date.now() }),
		).toBeNull();
		expect(
			normalizeAnalyticsEvent({ type: "pageview", timestamp: "invalid" }),
		).toBeNull();
	});

	it("parses stored events and applies retention filtering", () => {
		const now = day("2026-03-22T00:00:00.000Z");
		const stored = JSON.stringify([
			pageview({ timestamp: now - 10 * 24 * 60 * 60 * 1000 }),
			pageview({ timestamp: now - 100 * 24 * 60 * 60 * 1000 }),
			{ type: "pageview", timestamp: "invalid" },
		]);

		expect(parseStoredAnalyticsEvents(stored, { now })).toEqual([
			pageview({ timestamp: now - 10 * 24 * 60 * 60 * 1000 }),
		]);
		expect(filterEventsByRetention([], { now })).toEqual([]);
	});
});

describe("analytics dashboard period helpers", () => {
	it("creates inclusive current and prior period boundaries", () => {
		const comparison = createPeriodComparison("2026-03-10", "2026-03-12");

		expect(comparison.startDate.toISOString()).toBe("2026-03-10T00:00:00.000Z");
		expect(comparison.endDate.toISOString()).toBe("2026-03-12T23:59:59.999Z");
		expect(comparison.priorStart.toISOString()).toBe(
			"2026-03-07T00:00:00.000Z",
		);
		expect(comparison.priorEnd.toISOString()).toBe("2026-03-09T23:59:59.999Z");
	});

	it("filters events by period boundaries and selected version", () => {
		const { startDate, endDate } = createPeriodComparison(
			"2026-03-10",
			"2026-03-12",
		);
		const events = [
			pageview({ timestamp: day("2026-03-09T23:59:59.999Z") }),
			pageview({ timestamp: day("2026-03-10T00:00:00.000Z"), version: "v1" }),
			pageview({ timestamp: day("2026-03-12T23:59:59.999Z"), version: "v2" }),
			pageview({ timestamp: day("2026-03-13T00:00:00.000Z") }),
		];

		expect(
			filterEventsForPeriod(events, startDate, endDate, "all"),
		).toHaveLength(2);
		expect(filterEventsForPeriod(events, startDate, endDate, "v1")).toEqual([
			pageview({ timestamp: day("2026-03-10T00:00:00.000Z"), version: "v1" }),
		]);
	});
});

describe("analytics dashboard aggregation helpers", () => {
	it("returns empty aggregates for empty datasets", () => {
		expect(summarizeAnalyticsEvents([])).toMatchObject({
			totalViews: 0,
			avgTime: 0,
			avgScroll: 0,
		});
		expect(aggregateChapterMetrics([])).toEqual([]);
		expect(aggregateVersionMetrics([])).toEqual([]);
		expect(aggregateLocaleMetrics([])).toEqual([]);
	});

	it("aggregates chapter, version, and locale metrics", () => {
		const events = [
			pageview({ chapterSlug: "chapter-one", version: "v1", locale: "en" }),
			pageview({ chapterSlug: "chapter-one", version: "v1", locale: "en" }),
			engagement({
				chapterSlug: "chapter-one",
				version: "v1",
				durationSeconds: 60,
				scrollDepth: 0.75,
			}),
			pageview({ chapterSlug: "chapter-two", version: "v2", locale: "fr" }),
			engagement({
				chapterSlug: "chapter-two",
				version: "v2",
				durationSeconds: 30,
				scrollDepth: 0.25,
			}),
		];

		expect(aggregateChapterMetrics(events)).toEqual([
			{
				chapter: "chapter-one",
				views: 2,
				avgTime: 60,
				avgScroll: 0.75,
				dropOff: 0.25,
			},
			{
				chapter: "chapter-two",
				views: 1,
				avgTime: 30,
				avgScroll: 0.25,
				dropOff: 0.75,
			},
		]);

		expect(aggregateVersionMetrics(events)).toEqual([
			{ version: "v1", views: 2, avgTime: 60, avgScroll: 0.75, dropOff: 0.25 },
			{ version: "v2", views: 1, avgTime: 30, avgScroll: 0.25, dropOff: 0.75 },
		]);

		expect(aggregateLocaleMetrics(events)).toEqual([
			{ locale: "en", views: 2, share: 2 / 3 },
			{ locale: "fr", views: 1, share: 1 / 3 },
		]);
	});

	it("keeps single-version datasets collapsed to one row", () => {
		const rows = aggregateVersionMetrics([
			pageview({ version: "v1" }),
			engagement({ version: "v1", durationSeconds: 30, scrollDepth: 0.4 }),
		]);

		expect(rows).toEqual([
			{ version: "v1", views: 1, avgTime: 30, avgScroll: 0.4, dropOff: 0.6 },
		]);
	});
});

describe("analytics dashboard formatting helpers", () => {
	it("formats metric deltas for zero prior values and negative changes", () => {
		expect(formatMetricDelta("views", 5, 0)).toEqual({
			absoluteDelta: 5,
			pctDelta: 1,
			text: "+5 (+100.0%)",
		});

		expect(formatMetricDelta("dropoff", 0.1, 0.25)).toEqual({
			absoluteDelta: -0.15,
			pctDelta: -0.6,
			text: "-15.0% (-60.0%)",
		});
	});

	it("builds sparkline points for empty and non-empty series", () => {
		expect(createSparklinePoints([])).toBe("0,16 100,16");
		expect(createSparklinePoints([0, 5, 10])).toBe("0,30 50,16 100,2");
	});
});
