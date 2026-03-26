import type { ProgressBucket, TrendPoint } from "./useDashboardInsights";

export type ProgressBarDetail = {
  label: string;
  count: number;
  ratio: number;
  height: number;
  detail: string;
};

export type TrendChartPoint = {
  x: number;
  y: number;
  label: string;
  count: number;
  detail: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

export function hasProgressDistributionData(buckets: ProgressBucket[]) {
  return buckets.some((item) => item.count > 0);
}

export function hasTrendData(points: TrendPoint[]) {
  return points.some((item) => item.count > 0 && item.label !== "暂无");
}

export function buildProgressBarDetails(buckets: ProgressBucket[], iterationCount: number): ProgressBarDetail[] {
  const safeTotal = Math.max(iterationCount, 1);
  const peak = Math.max(...buckets.map((item) => item.count), 1);
  return buckets.map((item) => {
    const ratio = item.count / safeTotal;
    return {
      label: item.label,
      count: item.count,
      ratio,
      height: clamp(Math.round((item.count / peak) * 100), 14, 100),
      detail: `${item.label}：${item.count} 个迭代，占 ${formatPercent(ratio)}。`
    };
  });
}

export function buildTrendChartPoints(source: TrendPoint[]): TrendChartPoint[] {
  const normalized = source.filter((item) => item.label !== "暂无");
  if (normalized.length === 0) {
    return [];
  }
  const max = Math.max(...normalized.map((item) => item.count), 1);
  return normalized.map((item, index) => {
    const x = normalized.length === 1 ? 50 : (index / (normalized.length - 1)) * 100;
    const y = 100 - Math.round((item.count / max) * 72 + 14);
    const compactLabel = item.label.length >= 7 ? item.label.slice(2).replace("-", "/") : item.label;
    return {
      x,
      y,
      label: compactLabel,
      count: item.count,
      detail: `${item.label}：生成 ${item.count} 次代码交付。`
    };
  });
}
