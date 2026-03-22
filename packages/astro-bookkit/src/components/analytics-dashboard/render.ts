import {
  createSparklinePoints,
  formatMetricValue,
  formatPercent,
  formatSeconds,
  type AggregatedChapterRow,
  type AggregatedLocaleRow,
  type AggregatedVersionRow,
  type AnalyticsMetric,
  type MetricDelta,
} from "../../analytics/dashboard";

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (typeof options.textContent === "string") element.textContent = options.textContent;
  Object.entries(options.attributes ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
};

const createMetricCell = (textContent: string): HTMLTableCellElement =>
  createElement("td", { className: "analytics-table__metric", textContent });

const createLabelCell = (textContent: string): HTMLTableCellElement =>
  createElement("th", {
    className: "analytics-table__label",
    textContent,
    attributes: { scope: "row" },
  });

const replaceTableRows = (target: HTMLElement, rows: HTMLTableRowElement[]): void => {
  target.replaceChildren(...rows);
};

const humanizeSlug = (value: string): string => value.replace(/-/g, " ");

export const renderChapterRows = (
  target: HTMLElement,
  rows: AggregatedChapterRow[],
): void => {
  replaceTableRows(
    target,
    rows.map((row) => {
      const tr = document.createElement("tr");
      tr.append(
        createLabelCell(humanizeSlug(row.chapter)),
        createMetricCell(row.views.toString()),
        createMetricCell(formatSeconds(row.avgTime)),
        createMetricCell(formatPercent(row.avgScroll)),
        createMetricCell(formatPercent(row.dropOff)),
      );
      return tr;
    }),
  );
};

export const renderVersionRows = (
  target: HTMLElement,
  rows: AggregatedVersionRow[],
): void => {
  replaceTableRows(
    target,
    rows.map((row) => {
      const tr = document.createElement("tr");
      tr.append(
        createLabelCell(row.version),
        createMetricCell(row.views.toString()),
        createMetricCell(formatSeconds(row.avgTime)),
        createMetricCell(formatPercent(row.avgScroll)),
        createMetricCell(formatPercent(row.dropOff)),
      );
      return tr;
    }),
  );
};

export const renderLocaleRows = (
  target: HTMLElement,
  rows: AggregatedLocaleRow[],
): void => {
  replaceTableRows(
    target,
    rows.map((row) => {
      const tr = document.createElement("tr");
      tr.append(
        createLabelCell(row.locale),
        createMetricCell(row.views.toString()),
        createMetricCell(formatPercent(row.share)),
      );
      return tr;
    }),
  );
};

export const renderMetric = (
  root: ParentNode,
  metric: AnalyticsMetric,
  value: number,
  delta: MetricDelta,
  note: string,
  emphasized: boolean,
): void => {
  const valueTarget = root.querySelector<HTMLElement>(`[data-metric-current='${metric}']`);
  const deltaTarget = root.querySelector<HTMLElement>(`[data-metric-delta='${metric}']`);
  const noteTarget = root.querySelector<HTMLElement>(`[data-metric-note='${metric}']`);

  if (valueTarget) valueTarget.textContent = formatMetricValue(metric, value);
  if (deltaTarget) {
    deltaTarget.textContent = delta.text;
    deltaTarget.classList.toggle("is-emphasis", emphasized);
  }
  if (noteTarget) noteTarget.textContent = note;
};

export const renderSparkline = (
  root: ParentNode,
  metric: AnalyticsMetric,
  values: number[],
): void => {
  const polyline = root.querySelector<SVGPolylineElement>(`[data-sparkline='${metric}']`);
  if (!polyline) return;
  polyline.setAttribute("points", createSparklinePoints(values));
};
