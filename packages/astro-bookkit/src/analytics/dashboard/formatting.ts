import type { AnalyticsMetric, MetricDelta } from "./types";

const metricConfigs: Record<
	AnalyticsMetric,
	{
		decimals: number;
		unit: string;
		scale?: number;
		minPctForNote: number;
		minAbsForNote: number;
	}
> = {
	views: { decimals: 0, unit: "", minPctForNote: 0.15, minAbsForNote: 20 },
	time: { decimals: 1, unit: "s", minPctForNote: 0.1, minAbsForNote: 5 },
	dropoff: {
		decimals: 1,
		unit: "%",
		scale: 100,
		minPctForNote: 0.08,
		minAbsForNote: 2.5,
	},
};

export const formatSeconds = (value: number): string => {
	if (!value || Number.isNaN(value)) return "0s";
	if (value < 60) return `${Math.round(value)}s`;

	const minutes = Math.floor(value / 60);
	const seconds = Math.round(value % 60);
	return `${minutes}m ${seconds}s`;
};

export const formatPercent = (value: number): string =>
	`${Math.round(value * 100)}%`;

export const formatMetricValue = (
	metric: AnalyticsMetric,
	value: number,
): string => {
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
	const pctDelta =
		safePrior === 0 ? (safeCurrent === 0 ? 0 : 1) : absoluteDelta / safePrior;
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

export const isStatisticallyNotable = (
	metric: AnalyticsMetric,
	delta: MetricDelta,
): boolean => {
	const config = metricConfigs[metric];
	const scaledAbs = Math.abs(delta.absoluteDelta * (config.scale ?? 1));
	return (
		Math.abs(delta.pctDelta) >= config.minPctForNote &&
		scaledAbs >= config.minAbsForNote
	);
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
