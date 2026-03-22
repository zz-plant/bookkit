import {
  aggregateChapterMetrics,
  aggregateLocaleMetrics,
  aggregateVersionMetrics,
  buildDailySeries,
  clamp,
  createPeriodComparison,
  createUniqueVersions,
  filterEventsByRetention,
  filterEventsForPeriod,
  formatMetricDelta,
  isStatisticallyNotable,
  normalizeAnalyticsEvent,
  parseStoredAnalyticsEvents,
  summarizeAnalyticsEvents,
  type AnalyticsDashboardEvent,
  type AnalyticsMetric,
} from "../../analytics/dashboard";
import { renderChapterRows, renderLocaleRows, renderMetric, renderSparkline, renderVersionRows } from "./render";

const RETENTION_DAYS = 90;

const resolveEndpoint = (value: string | undefined): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
};

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const getRangeDefaults = (): { start: Date; end: Date } => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return { start, end };
};

const createOption = (value: string, label: string): HTMLOptionElement => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
};

const loadLocalEvents = (storageKey: string): AnalyticsDashboardEvent[] =>
  parseStoredAnalyticsEvents(localStorage.getItem(storageKey), {
    retentionDays: RETENTION_DAYS,
  });

const loadRemoteEvents = async (endpoint: string): Promise<AnalyticsDashboardEvent[]> => {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return [];
    const payload = await response.json();
    if (!Array.isArray(payload?.events)) return [];
    return filterEventsByRetention(
      payload.events
        .map((event: unknown) => normalizeAnalyticsEvent(event))
        .filter((event: AnalyticsDashboardEvent | null): event is AnalyticsDashboardEvent => Boolean(event)),
      { retentionDays: RETENTION_DAYS },
    );
  } catch {
    return [];
  }
};

const loadEvents = async (endpoint: string | null, storageKey: string): Promise<AnalyticsDashboardEvent[]> => {
  if (endpoint) {
    const remoteEvents = await loadRemoteEvents(endpoint);
    if (remoteEvents.length) return remoteEvents;
  }
  return loadLocalEvents(storageKey);
};

const getMetricNote = (metric: AnalyticsMetric, delta: ReturnType<typeof formatMetricDelta>): string => {
  if (!isStatisticallyNotable(metric, delta)) return "";
  return delta.absoluteDelta > 0 ? "Notable increase vs prior period" : "Notable decrease vs prior period";
};

const initDashboard = async (dashboard: Element): Promise<void> => {
  const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
  const storageKey = `${analyticsKeyPrefix}.analytics.events`;
  const endpoint = resolveEndpoint(dashboard.getAttribute("data-analytics-endpoint") ?? undefined);

  const versionSelect = dashboard.querySelector<HTMLSelectElement>("[data-filter-version]");
  const startInput = dashboard.querySelector<HTMLInputElement>("[data-filter-start]");
  const endInput = dashboard.querySelector<HTMLInputElement>("[data-filter-end]");
  const emptyState = dashboard.querySelector<HTMLElement>("[data-analytics-empty]");
  const tableWrap = dashboard.querySelector<HTMLElement>("[data-analytics-table]");
  const versionTableWrap = dashboard.querySelector<HTMLElement>("[data-analytics-versions]");
  const localeTableWrap = dashboard.querySelector<HTMLElement>("[data-analytics-locales]");
  const rowsTarget = dashboard.querySelector<HTMLElement>("[data-analytics-rows]");
  const versionRowsTarget = dashboard.querySelector<HTMLElement>("[data-analytics-version-rows]");
  const localeRowsTarget = dashboard.querySelector<HTMLElement>("[data-analytics-locale-rows]");

  if (
    !versionSelect ||
    !startInput ||
    !endInput ||
    !emptyState ||
    !tableWrap ||
    !versionTableWrap ||
    !localeTableWrap ||
    !rowsTarget ||
    !versionRowsTarget ||
    !localeRowsTarget
  ) {
    return;
  }

  const { start, end } = getRangeDefaults();
  startInput.value = toDateInput(start);
  endInput.value = toDateInput(end);

  let events = await loadEvents(endpoint, storageKey);
  let versions = createUniqueVersions(events);

  const fillVersions = (): void => {
    versionSelect.replaceChildren(
      createOption("all", "All versions"),
      ...versions.map((version) => createOption(version, version)),
    );
  };

  const render = (): void => {
    const selectedVersion = versionSelect.value || "all";
    const { startDate, endDate, priorStart, priorEnd } = createPeriodComparison(startInput.value, endInput.value);
    const currentEvents = filterEventsForPeriod(events, startDate, endDate, selectedVersion);
    const priorEvents = filterEventsForPeriod(events, priorStart, priorEnd, selectedVersion);
    const current = summarizeAnalyticsEvents(currentEvents);
    const prior = summarizeAnalyticsEvents(priorEvents);

    emptyState.hidden = currentEvents.length > 0;
    tableWrap.hidden = currentEvents.length === 0;

    const metrics: Record<AnalyticsMetric, { current: number; prior: number }> = {
      views: { current: current.totalViews, prior: prior.totalViews },
      time: { current: current.avgTime, prior: prior.avgTime },
      dropoff: {
        current: clamp(1 - current.avgScroll, 0, 1),
        prior: clamp(1 - prior.avgScroll, 0, 1),
      },
    };

    const deltas = Object.entries(metrics).map(([metric, values]) => ({
      metric: metric as AnalyticsMetric,
      delta: formatMetricDelta(metric as AnalyticsMetric, values.current, values.prior),
    }));

    const emphasisMetric = deltas
      .slice()
      .sort((a, b) => Math.abs(b.delta.pctDelta) - Math.abs(a.delta.pctDelta))[0]?.metric;

    (Object.entries(metrics) as [AnalyticsMetric, { current: number; prior: number }][]).forEach(
      ([metric, values]) => {
        const delta = formatMetricDelta(metric, values.current, values.prior);
        renderMetric(
          dashboard,
          metric,
          values.current,
          delta,
          getMetricNote(metric, delta),
          metric === emphasisMetric && Math.abs(delta.pctDelta) > 0,
        );
      },
    );

    renderSparkline(dashboard, "views", buildDailySeries(current.pageviews, () => 1));
    renderSparkline(
      dashboard,
      "time",
      buildDailySeries(current.engagements, (event) => event.durationSeconds ?? 0),
    );
    renderSparkline(
      dashboard,
      "dropoff",
      buildDailySeries(current.engagements, (event) => 1 - (event.scrollDepth ?? 0)),
    );

    const chapterRows = aggregateChapterMetrics(currentEvents);
    renderChapterRows(rowsTarget, chapterRows);

    const versionRows = aggregateVersionMetrics(currentEvents);
    renderVersionRows(versionRowsTarget, versionRows);
    versionTableWrap.hidden = versionRows.length <= 1;

    const localeRows = aggregateLocaleMetrics(currentEvents);
    renderLocaleRows(localeRowsTarget, localeRows);
    localeTableWrap.hidden = localeRows.length === 0;
  };

  fillVersions();
  render();

  [versionSelect, startInput, endInput].forEach((control) => {
    control.addEventListener("change", render);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    events = loadLocalEvents(storageKey);
    versions = createUniqueVersions(events);
    fillVersions();
    render();
  });
};

document.querySelectorAll("[data-analytics-dashboard]").forEach((dashboard) => {
  void initDashboard(dashboard);
});
