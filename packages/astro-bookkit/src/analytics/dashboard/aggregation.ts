import type {
  AggregatedChapterRow,
  AggregatedLocaleRow,
  AggregatedVersionRow,
  AnalyticsDashboardEvent,
  AnalyticsSummary,
} from "./types";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const summarizeAnalyticsEvents = (events: AnalyticsDashboardEvent[]): AnalyticsSummary => {
  const pageviews = events.filter((event) => event.type === "pageview");
  const engagements = events.filter((event) => event.type === "engagement");
  const totalViews = pageviews.length;
  const totalTime = engagements.reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0);
  const totalScroll = engagements.reduce((sum, event) => sum + (event.scrollDepth ?? 0), 0);

  return {
    totalViews,
    avgTime: engagements.length ? totalTime / engagements.length : 0,
    avgScroll: engagements.length ? totalScroll / engagements.length : 0,
    pageviews,
    engagements,
  };
};

type AggregationEntry = {
  views: number;
  time: number;
  engagements: number;
  scroll: number;
};

const toMetricRow = (
  row: AggregationEntry,
): { views: number; avgTime: number; avgScroll: number; dropOff: number } => {
  const avgTime = row.engagements ? row.time / row.engagements : 0;
  const avgScroll = row.engagements ? row.scroll / row.engagements : 0;

  return {
    views: row.views,
    avgTime,
    avgScroll,
    dropOff: clamp(1 - avgScroll, 0, 1),
  };
};

const updateAggregation = (
  entry: AggregationEntry,
  event: AnalyticsDashboardEvent,
): AggregationEntry => {
  if (event.type === "pageview") {
    entry.views += 1;
  }

  if (event.type === "engagement") {
    entry.time += event.durationSeconds ?? 0;
    entry.engagements += 1;
    entry.scroll += event.scrollDepth ?? 0;
  }

  return entry;
};

export const aggregateChapterMetrics = (events: AnalyticsDashboardEvent[]): AggregatedChapterRow[] => {
  const chapterMap = new Map<string, AggregationEntry>();

  events.forEach((event) => {
    const key = event.chapterSlug ?? "unknown";
    const entry = chapterMap.get(key) ?? { views: 0, time: 0, engagements: 0, scroll: 0 };
    chapterMap.set(key, updateAggregation(entry, event));
  });

  return Array.from(chapterMap.entries())
    .filter(([chapter]) => chapter !== "unknown")
    .map(([chapter, entry]) => ({ chapter, ...toMetricRow(entry) }))
    .sort((a, b) => b.views - a.views || a.chapter.localeCompare(b.chapter));
};

export const aggregateVersionMetrics = (events: AnalyticsDashboardEvent[]): AggregatedVersionRow[] => {
  const versionMap = new Map<string, AggregationEntry>();

  events.forEach((event) => {
    const key = event.version || "draft";
    const entry = versionMap.get(key) ?? { views: 0, time: 0, engagements: 0, scroll: 0 };
    versionMap.set(key, updateAggregation(entry, event));
  });

  return Array.from(versionMap.entries())
    .map(([version, entry]) => ({ version, ...toMetricRow(entry) }))
    .sort((a, b) => b.views - a.views || a.version.localeCompare(b.version));
};

export const aggregateLocaleMetrics = (events: AnalyticsDashboardEvent[]): AggregatedLocaleRow[] => {
  const pageviews = events.filter((event) => event.type === "pageview");
  const localeMap = new Map<string, number>();

  pageviews.forEach((event) => {
    const locale = event.locale || "unknown";
    localeMap.set(locale, (localeMap.get(locale) ?? 0) + 1);
  });

  const totalViews = pageviews.length;

  return Array.from(localeMap.entries())
    .filter(([locale]) => locale !== "unknown")
    .map(([locale, views]) => ({
      locale,
      views,
      share: totalViews ? views / totalViews : 0,
    }))
    .sort((a, b) => b.views - a.views || a.locale.localeCompare(b.locale));
};

export const createUniqueVersions = (events: AnalyticsDashboardEvent[]): string[] =>
  Array.from(new Set(events.map((event) => event.version).filter((value): value is string => Boolean(value))));
