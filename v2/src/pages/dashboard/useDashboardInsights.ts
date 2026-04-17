import { useEffect, useMemo, useState } from "react";
import { fetchProjectIterations } from "../../app/workspaceApi";
import type { Iteration, Project } from "../../domain/workspace/types";
import { filterIterationsByWindow, getScopeIterations, sortInsightsByLevel, type InsightScope, type InsightWindowDays } from "./dashboardInsightScopeModel";

export type ProgressBucket = { label: string; count: number };
export type TrendPoint = { label: string; count: number };
type InsightItem = { level: "good" | "watch" | "risk"; title: string; finding: string; impact: string };
type RecommendationItem = {
  priority: "P0" | "P1" | "P2";
  title: string;
  action: string;
  upgrade: string;
  scope: "project" | "portfolio" | "both";
  scopeLabel: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const hasOwn = (record: Record<number, Iteration[]>, key: number) => Object.prototype.hasOwnProperty.call(record, key);

function buildProgressBuckets(iterations: Iteration[]) {
  const buckets = [
    { label: "0-25%", min: 0, max: 25 },
    { label: "26-50%", min: 26, max: 50 },
    { label: "51-75%", min: 51, max: 75 },
    { label: "76-100%", min: 76, max: 100 }
  ];
  return buckets.map((bucket) => ({
    label: bucket.label,
    count: iterations.filter((item) => item.progress >= bucket.min && item.progress <= bucket.max).length
  }));
}

function buildMonthlyTrend(iterations: Iteration[]) {
  const monthCounter = new Map<string, number>();
  for (const item of iterations) {
    const month = item.createdAt?.slice(0, 7);
    if (month) {
      monthCounter.set(month, (monthCounter.get(month) || 0) + 1);
    }
  }
  const points = Array.from(monthCounter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([label, count]) => ({ label, count }));
  return points.length > 0 ? points : [{ label: "暂无", count: 0 }];
}

function computeInsightMetrics(scopeProgressBuckets: ProgressBucket[], scopeMonthlyTrend: TrendPoint[], scopeIterationCount: number, scopeCompleted: number, scopeInProgress: number) {
  const lowProgressCount = scopeProgressBuckets
    .filter((b) => b.label === "0-25%" || b.label === "26-50%").reduce((s, b) => s + b.count, 0);
  const highProgressCount = scopeProgressBuckets
    .filter((b) => b.label === "76-100%").reduce((s, b) => s + b.count, 0);
  const completionRate = scopeIterationCount > 0 ? scopeCompleted / scopeIterationCount : 0;
  const lowProgressRatio = scopeIterationCount > 0 ? lowProgressCount / scopeIterationCount : 0;
  const inProgressRatio = scopeIterationCount > 0 ? scopeInProgress / scopeIterationCount : 0;

  const trendPoints = scopeMonthlyTrend.filter((p) => p.label !== "暂无");
  const sumCount = (pts: TrendPoint[]) => pts.reduce((s, p) => s + p.count, 0);
  const recentAvg = trendPoints.slice(-3).length > 0 ? sumCount(trendPoints.slice(-3)) / trendPoints.slice(-3).length : 0;
  const prevAvg = trendPoints.slice(-6, -3).length > 0 ? sumCount(trendPoints.slice(-6, -3)) / trendPoints.slice(-6, -3).length : 0;
  const throughputDelta = prevAvg > 0 ? (recentAvg - prevAvg) / prevAvg : 0;

  return { lowProgressCount, highProgressCount, completionRate, lowProgressRatio, inProgressRatio, throughputDelta, trendPoints };
}

function computeHealthScore(metrics: ReturnType<typeof computeInsightMetrics>, scopeIterationCount: number, scopeInProgress: number, serviceHealthy: boolean) {
  const sampleDampen = scopeIterationCount < 3 ? 0.3 : 1;
  const penalty = metrics.lowProgressRatio * 35 * sampleDampen + (1 - metrics.completionRate) * 25 * sampleDampen
    + (metrics.throughputDelta < -0.15 ? 20 : metrics.throughputDelta < 0 ? 10 : 0)
    + (serviceHealthy ? 0 : 20) + (metrics.inProgressRatio > 0.8 && scopeInProgress >= 3 ? 8 : 0);
  const score = clamp(Math.round(100 - penalty), 0, 100);
  return { score, level: score >= 80 ? "健康" : score >= 60 ? "预警" : "高风险" };
}

function buildInsights(metrics: ReturnType<typeof computeInsightMetrics>, scopeInProgress: number, serviceHealthy: boolean, displayStatus: string): InsightItem[] {
  const { lowProgressRatio, lowProgressCount, highProgressCount, throughputDelta, trendPoints } = metrics;
  const items: InsightItem[] = sortInsightsByLevel([
    lowProgressRatio >= 0.45 && lowProgressCount >= 3
      ? { level: "risk", title: "前段积压偏高", finding: `低进度迭代占比 ${formatPercent(lowProgressRatio)}，需求被切小但关单速度不足。`, impact: "会持续推高上下文切换成本，拖慢中后段交付。" }
      : { level: "good", title: "阶段推进结构可控", finding: `低进度迭代占比 ${formatPercent(lowProgressRatio)}，未出现明显"只开工不收敛"现象。`, impact: "可把治理重心放在质量门禁和复盘机制，而非盲目加人。" },
    trendPoints.length >= 4
      ? { level: throughputDelta < -0.15 ? "risk" : throughputDelta < 0 ? "watch" : "good", title: "交付吞吐趋势", finding: `近3个月迭代产出较前3个月${throughputDelta >= 0 ? "提升" : "下降"}${Math.abs(Math.round(throughputDelta * 100))}%。`, impact: throughputDelta < 0 ? "如果不做流程升级，后续版本节奏会继续下滑。" : "当前节奏可支撑更高密度版本发布。" }
      : { level: "watch", title: "趋势样本偏少", finding: "月度数据不足 4 个样本点，趋势判断可信度有限。", impact: "建议先补齐关键阶段数据，再做容量规划。" },
    { level: scopeInProgress - highProgressCount > 2 ? "watch" : "good", title: "收尾效率", finding: `进行中迭代 ${scopeInProgress} 个，其中高进度待收口 ${highProgressCount} 个。`, impact: scopeInProgress - highProgressCount > 2 ? "说明执行中项目多于可收尾项目，容易形成长期尾项。" : "收口压力可控，可继续推进连续交付。" }
  ]);
  if (!serviceHealthy) {
    items.push({ level: "risk", title: "平台依赖风险", finding: `服务状态为${displayStatus}，工程面板存在基础依赖不稳定。`, impact: "会放大发布窗口不确定性，影响迭代验收节奏。" });
  }
  return sortInsightsByLevel(items);
}

function buildRecommendations(metrics: ReturnType<typeof computeInsightMetrics>, scopeInProgress: number, serviceHealthy: boolean, insightScope: InsightScope): RecommendationItem[] {
  const recs: RecommendationItem[] = [];
  if (metrics.lowProgressRatio >= 0.45 && scopeInProgress >= 3) {
    recs.push({ priority: "P0", title: "控制并行迭代数量", action: "当前有较多迭代进展缓慢。建议先集中精力完成进行中的迭代，再启动新的。", upgrade: "少量聚焦比大量并行更高效。", scope: "project", scopeLabel: "项目维度" });
  }
  if (metrics.throughputDelta < 0) {
    recs.push({ priority: "P1", title: "关注迭代完成速度下降", action: "近期完成的迭代数量在下降。建议回顾是否有需求不清晰、评审时间过长或返工过多的情况。", upgrade: "定期复盘有助于发现和解决瓶颈。", scope: "both", scopeLabel: "项目/跨项目" });
  }
  if (!serviceHealthy) {
    recs.push({ priority: "P0", title: "关注平台服务状态", action: "当前平台基础服务存在异常，建议在发布前确认服务恢复正常。", upgrade: "服务稳定是顺利发布的前提。", scope: "portfolio", scopeLabel: "跨项目维度" });
  }
  if (recs.length === 0) {
    recs.push({ priority: "P2", title: "建立迭代复盘习惯", action: "建议每次迭代完成后做一次简短回顾，记录做得好的和需要改进的。", upgrade: "持续积累经验，减少同类问题重复出现。", scope: "both", scopeLabel: "项目/跨项目" });
  }
  return recs.filter((item) => item.scope === "both" || item.scope === insightScope);
}

interface DashboardInsightParams {
  projects: Project[];
  currentProjectId: number | null;
  fallbackInProgress: number;
  fallbackCompleted: number;
  fallbackIterationCount: number;
  fallbackProgressBuckets: ProgressBucket[];
  fallbackMonthlyTrend: TrendPoint[];
  serviceHealthy: boolean;
  displayStatus: string;
}

function useDashboardInsightState(projects: Project[], currentProjectId: number | null, serviceHealthy: boolean) {
  const [insightScope, setInsightScope] = useState<InsightScope>("project");
  const [insightWindowDays, setInsightWindowDays] = useState<InsightWindowDays>(90);
  const [selectedInsightProjectId, setSelectedInsightProjectId] = useState<number | null>(currentProjectId ?? projects[0]?.id ?? null);
  const [iterationsByProject, setIterationsByProject] = useState<Record<number, Iteration[]>>({});
  const [loadingIterations, setLoadingIterations] = useState(false);

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedInsightProjectId(null);
      return;
    }
    setSelectedInsightProjectId((prev) => {
      if (prev && projects.some((item) => item.id === prev)) {
        return prev;
      }
      if (currentProjectId && projects.some((item) => item.id === currentProjectId)) {
        return currentProjectId;
      }
      return projects[0]?.id ?? null;
    });
  }, [currentProjectId, projects]);

  useEffect(() => {
    if (!serviceHealthy || projects.length === 0) {
      setIterationsByProject({});
      setLoadingIterations(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoadingIterations(true);
      const rows = await Promise.all(
        projects.map(async (item) => {
          try {
            return [item.id, await fetchProjectIterations(item.id)] as const;
          } catch (err) {
            console.debug("[Dashboard] 项目迭代加载失败", item.id, err);
            return [item.id, [] as Iteration[]] as const;
          }
        })
      );
      if (active) {
        setIterationsByProject(Object.fromEntries(rows));
        setLoadingIterations(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [projects, serviceHealthy]);

  return { insightScope, setInsightScope, insightWindowDays, setInsightWindowDays, selectedInsightProjectId, setSelectedInsightProjectId, iterationsByProject, loadingIterations };
}

function useDashboardInsightDerived(
  state: ReturnType<typeof useDashboardInsightState>,
  params: Pick<DashboardInsightParams, "projects" | "serviceHealthy" | "displayStatus" | "fallbackInProgress" | "fallbackCompleted" | "fallbackIterationCount" | "fallbackProgressBuckets" | "fallbackMonthlyTrend">
) {
  const { insightScope, insightWindowDays, selectedInsightProjectId, iterationsByProject } = state;
  const { projects, serviceHealthy, displayStatus, fallbackInProgress, fallbackCompleted, fallbackIterationCount, fallbackProgressBuckets, fallbackMonthlyTrend } = params;

  const scopeIterations = useMemo(
    () => getScopeIterations(insightScope, iterationsByProject, selectedInsightProjectId),
    [insightScope, iterationsByProject, selectedInsightProjectId]
  );
  const windowedScopeIterations = useMemo(
    () => filterIterationsByWindow(scopeIterations, insightWindowDays),
    [insightWindowDays, scopeIterations]
  );

  const scopeDataReady = useMemo(() => {
    if (!serviceHealthy || projects.length === 0) {
      return false;
    }
    if (insightScope === "portfolio") {
      return projects.every((item) => hasOwn(iterationsByProject, item.id));
    }
    return selectedInsightProjectId !== null ? hasOwn(iterationsByProject, selectedInsightProjectId) : false;
  }, [insightScope, iterationsByProject, projects, selectedInsightProjectId, serviceHealthy]);

  const scopedIterations = scopeDataReady ? windowedScopeIterations : [];
  const scopeIterationCount = scopeDataReady ? scopedIterations.length : fallbackIterationCount;
  const scopeCompleted = scopeDataReady ? scopedIterations.filter((item) => item.status === "completed").length : fallbackCompleted;
  const scopeInProgress = scopeDataReady ? scopedIterations.filter((item) => item.status !== "completed").length : fallbackInProgress;
  const scopeProgressBuckets = scopeDataReady ? buildProgressBuckets(scopedIterations) : fallbackProgressBuckets;
  const scopeMonthlyTrend = scopeDataReady ? buildMonthlyTrend(scopedIterations) : fallbackMonthlyTrend;
  const hasScopeIterations = scopeIterationCount > 0;
  const hasMeaningfulTrend = scopeMonthlyTrend.some((point) => point.label !== "暂无" && point.count > 0);

  const insightModel = useMemo(() => {
    if (!hasScopeIterations) {
      return { healthScore: 0, healthLevel: "暂无数据", completionRate: 0, lowProgressRatio: 0, throughputDelta: 0, insights: [] as InsightItem[], recommendations: [] as RecommendationItem[] };
    }
    const metrics = computeInsightMetrics(scopeProgressBuckets, scopeMonthlyTrend, scopeIterationCount, scopeCompleted, scopeInProgress);
    const health = computeHealthScore(metrics, scopeIterationCount, scopeInProgress, serviceHealthy);
    const insights = buildInsights(metrics, scopeInProgress, serviceHealthy, displayStatus);
    const recommendations = buildRecommendations(metrics, scopeInProgress, serviceHealthy, insightScope);
    return { healthScore: health.score, healthLevel: health.level, completionRate: metrics.completionRate, lowProgressRatio: metrics.lowProgressRatio, throughputDelta: metrics.throughputDelta, insights, recommendations };
  }, [displayStatus, hasScopeIterations, insightScope, scopeCompleted, scopeInProgress, scopeIterationCount, scopeMonthlyTrend, scopeProgressBuckets, serviceHealthy]);

  return { scopeIterationCount, scopeCompleted, scopeInProgress, scopeProgressBuckets, scopeMonthlyTrend, hasScopeIterations, hasMeaningfulTrend, insightModel };
}

export function useDashboardInsights(params: DashboardInsightParams) {
  const { projects, currentProjectId, serviceHealthy } = params;
  const state = useDashboardInsightState(projects, currentProjectId, serviceHealthy);
  const derived = useDashboardInsightDerived(state, params);

  return {
    insightScope: state.insightScope,
    setInsightScope: state.setInsightScope,
    insightWindowDays: state.insightWindowDays,
    setInsightWindowDays: state.setInsightWindowDays,
    selectedInsightProjectId: state.selectedInsightProjectId,
    setSelectedInsightProjectId: state.setSelectedInsightProjectId,
    loadingIterations: state.loadingIterations,
    ...derived
  };
}
