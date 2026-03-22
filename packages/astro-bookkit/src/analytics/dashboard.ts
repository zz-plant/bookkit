import type { ReaderAnalyticsEvent } from "./analytics";

export type AnalyticsDashboardEvent = ReaderAnalyticsEvent & {
  locale?: string | null;
};

export type AnalyticsMetric = "views" | "time" | "dropoff";

export type AnalyticsSummary = {
  totalViews: number;
  avgTime: number;
  avgScroll: number;
  pageviews: AnalyticsDashboardEvent[];
  engagements: AnalyticsDashboardEvent[];
};

export type AggregatedChapterRow = {
  chapter: string;
  views: number;
  avgTime: number;
  avgScroll: number;
  dropOff: number;
};

export type AggregatedVersionRow = {
  version: string;
  views: number;
  avgTime: number;
  avgScroll: number;
  dropOff: number;
};

export type AggregatedLocaleRow = {
  locale: string;
  views: number;
  share: number;
};

export type MetricDelta = {
  absoluteDelta: number;
  pctDelta: number;
  text: string;
};

export type ComparisonPeriods = {
  startDate: Date;
  endDate: Date;
  priorStart: Date;
  priorEnd: Date;
  rangeDuration: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;

const metricConfigs: Record<AnalyticsMetric, {
  decimals: number;
  unit: string;
  scale?: number;
  minPctForNote: number;
  minAbsForNote: number;
}> = {
  views: { decimals: 0, unit: "", minPctForNote: 0.15, minAbsForNote: 20 },
  time: { decimals: 1, unit: "s", minPctForNote: 0.1, minAbsForNote: 5 },
  dropoff: { decimals: 1, unit: "%", scale: 100, minPctForNote: 0.08, minAbsForNote: 2.5 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const formatSeconds = (value: number): string => {
  if (!value || Number.isNaN(value)) return "0s";
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
};

export const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const formatMetricValue = (metric: AnalyticsMetric, value: number): string => {
  const config = metricConfigs[metric];
  const normalized = (config.scale ?? 1) * (Number.isFinite(value) ? value : 0);
  return `${normalized.toFixed(config.decimals)}${config.unit}`;
};

export const formatMetricDelta = (
  metric: AnalyticsMetric,
  current: number,
  prior: number,
): MetricDelta => {
  const config = metricConfigs[metric];
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safePrior = Number.isFinite(prior) ? prior : 0;
  const absoluteDelta = safeCurrent - safePrior;
  const pctDelta = safePrior === 0 ? (safeCurrent === 0 ? 0 : 1) : absoluteDelta / safePrior;
  const normalizedAbs = absoluteDelta * (config.scale ?? 1);
  const sign = absoluteDelta > 0 ? "+" : "";

  return {
    absoluteDelta,
    pctDelta,
    text: `${sign}${normalizedAbs.toFixed(config.decimals)}${config.unit} (${sign}${(
      pctDelta * 100
    ).toFixed(1)}%)`,
  };
};

export const isStatisticallyNotable = (metric: AnalyticsMetric, delta: MetricDelta): boolean => {
  const config = metricConfigs[metric];
  const scaledAbs = Math.abs(delta.absoluteDelta * (config.scale ?? 1));
  return Math.abs(delta.pctDelta) >= config.minPctForNote && scaledAbs >= config.minAbsForNote;
};

export const normalizeAnalyticsEvent = (value: unknown): AnalyticsDashboardEvent | null => {
  if (!isRecord(value)) return null;
  if (value.type !== "pageview" && value.type !== "engagement") return null;
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) return null;

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

const toDateAtStartOfDay = (value: string | Date): Date => {
  const date = new Date(typeof value === "string" ? value : value.getTime());
  date.setHours(0, 0, 0, 0);
  return date;
};

const toDateAtEndOfDay = (value: string | Date): Date => {
  const date = new Date(typeof value === "string" ? value : value.getTime());
  date.setHours(23, 59, 59, 999);
  return date;
};

export const createPeriodComparison = (start: string | Date, end: string | Date): ComparisonPeriods => {
  const startDate = toDateAtStartOfDay(start);
  const endDate = toDateAtEndOfDay(end);
  const rangeDuration = Math.max(endDate.getTime() - startDate.getTime() + 1, DAY_IN_MS);
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
    const inRange = event.timestamp >= startDate.getTime() && event.timestamp <= endDate.getTime();
    const inVersion = selectedVersion === "all" || event.version === selectedVersion;
    return inRange && inVersion;
  });

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

export const byDayKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

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

export const createSparklinePoints = (
  values: number[],
  options: { width?: number; height?: number; padding?: number } = {},
): string => {
  if (!values.length) return "0,16 100,16";

  const width = options.width ?? 100;
  const height = options.height ?? 32;
  const padding = options.padding ?? 2;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(" ");
};
