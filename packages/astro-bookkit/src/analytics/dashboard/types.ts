import type { ReaderAnalyticsEvent } from "../analytics";

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
