import { useEffect, useMemo, useState } from "react";
import { fetchProjectIterations } from "../../app/workspaceApi";
import type { Iteration, Project } from "../../domain/workspace/types";

export type ProgressBucket = { label: string; count: number };
export type TrendPoint = { label: string; count: number };
type InsightLevel = "good" | "watch" | "risk";
type InsightItem = { level: InsightLevel; title: string; finding: string; impact: string };
type RecommendationItem = { priority: "P0" | "P1" | "P2"; title: string; action: string; upgrade: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

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

export function useDashboardInsights({
  projects,
  currentProjectId,
  fallbackInProgress,
  fallbackCompleted,
  fallbackIterationCount,
  fallbackProgressBuckets,
  fallbackMonthlyTrend,
  serviceHealthy,
  displayStatus
}: {
  projects: Project[];
  currentProjectId: number | null;
  fallbackInProgress: number;
  fallbackCompleted: number;
  fallbackIterationCount: number;
  fallbackProgressBuckets: ProgressBucket[];
  fallbackMonthlyTrend: TrendPoint[];
  serviceHealthy: boolean;
  displayStatus: string;
}) {
  const [insightScope, setInsightScope] = useState<"project" | "portfolio">("project");
  const [iterationsByProject, setIterationsByProject] = useState<Record<number, Iteration[]>>({});
  const [loadingIterations, setLoadingIterations] = useState(false);
  const selectedProjectId = currentProjectId ?? projects[0]?.id ?? null;

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
          } catch {
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

  const scopeIterations = useMemo(() => {
    if (insightScope === "portfolio") {
      return Object.values(iterationsByProject).flat();
    }
    return selectedProjectId ? (iterationsByProject[selectedProjectId] ?? []) : [];
  }, [insightScope, iterationsByProject, selectedProjectId]);

  const scopeIterationCount = scopeIterations.length || fallbackIterationCount;
  const scopeCompleted = scopeIterations.filter((item) => item.status === "completed").length || fallbackCompleted;
  const scopeInProgress = scopeIterations.filter((item) => item.status !== "completed").length || fallbackInProgress;
  const scopeProgressBuckets = scopeIterations.length > 0 ? buildProgressBuckets(scopeIterations) : fallbackProgressBuckets;
  const scopeMonthlyTrend = scopeIterations.length > 0 ? buildMonthlyTrend(scopeIterations) : fallbackMonthlyTrend;

  const insightModel = useMemo(() => {
    const lowProgressCount = scopeProgressBuckets
      .filter((bucket) => bucket.label === "0-25%" || bucket.label === "26-50%")
      .reduce((sum, bucket) => sum + bucket.count, 0);
    const highProgressCount = scopeProgressBuckets
      .filter((bucket) => bucket.label === "76-100%")
      .reduce((sum, bucket) => sum + bucket.count, 0);
    const completionRate = scopeIterationCount > 0 ? scopeCompleted / scopeIterationCount : 0;
    const lowProgressRatio = scopeIterationCount > 0 ? lowProgressCount / scopeIterationCount : 0;
    const inProgressRatio = scopeIterationCount > 0 ? scopeInProgress / scopeIterationCount : 0;

    const trendPoints = scopeMonthlyTrend.filter((point) => point.label !== "暂无");
    const recent3 = trendPoints.slice(-3);
    const previous3 = trendPoints.slice(-6, -3);
    const sumCount = (points: TrendPoint[]) => points.reduce((sum, point) => sum + point.count, 0);
    const recentAvg = recent3.length > 0 ? sumCount(recent3) / recent3.length : 0;
    const previousAvg = previous3.length > 0 ? sumCount(previous3) / previous3.length : 0;
    const throughputDelta = previousAvg > 0 ? (recentAvg - previousAvg) / previousAvg : 0;
    const healthPenalty = lowProgressRatio * 35 + (1 - completionRate) * 25 + (throughputDelta < -0.15 ? 20 : throughputDelta < 0 ? 10 : 0) + (serviceHealthy ? 0 : 20) + (inProgressRatio > 0.8 ? 8 : 0);
    const healthScore = clamp(Math.round(100 - healthPenalty), 0, 100);
    const healthLevel = healthScore >= 80 ? "健康" : healthScore >= 60 ? "预警" : "高风险";

    const insights: InsightItem[] = [
      lowProgressRatio >= 0.45
        ? { level: "risk", title: "前段积压偏高", finding: `低进度迭代占比 ${formatPercent(lowProgressRatio)}，需求被切小但关单速度不足。`, impact: "会持续推高上下文切换成本，拖慢中后段交付。" }
        : { level: "good", title: "阶段推进结构可控", finding: `低进度迭代占比 ${formatPercent(lowProgressRatio)}，未出现明显“只开工不收敛”现象。`, impact: "可把治理重心放在质量门禁和复盘机制，而非盲目加人。" },
      trendPoints.length >= 4
        ? { level: throughputDelta < -0.15 ? "risk" : throughputDelta < 0 ? "watch" : "good", title: "交付吞吐趋势", finding: `近3个月迭代产出较前3个月${throughputDelta >= 0 ? "提升" : "下降"}${Math.abs(Math.round(throughputDelta * 100))}%。`, impact: throughputDelta < 0 ? "如果不做流程升级，后续版本节奏会继续下滑。" : "当前节奏可支撑更高密度版本发布。" }
        : { level: "watch", title: "趋势样本偏少", finding: "月度数据不足 4 个样本点，趋势判断可信度有限。", impact: "建议先补齐关键阶段数据，再做容量规划。" },
      { level: scopeInProgress - highProgressCount > 2 ? "watch" : "good", title: "收尾效率", finding: `进行中迭代 ${scopeInProgress} 个，其中高进度待收口 ${highProgressCount} 个。`, impact: scopeInProgress - highProgressCount > 2 ? "说明执行中项目多于可收尾项目，容易形成长期尾项。" : "收口压力可控，可继续推进连续交付。" }
    ];
    if (!serviceHealthy) {
      insights.push({ level: "risk", title: "平台依赖风险", finding: `服务状态为${displayStatus}，工程面板存在基础依赖不稳定。`, impact: "会放大发布窗口不确定性，影响迭代验收节奏。" });
    }

    const recommendations: RecommendationItem[] = [];
    if (lowProgressRatio >= 0.45) recommendations.push({ priority: "P0", title: "建立 WIP 上限与关单门禁", action: "按项目设置进行中迭代上限，超限后仅允许处理阻塞和收尾任务。", upgrade: "从任务越多越忙升级为单位周期稳定关单率驱动。" });
    if (throughputDelta < 0) recommendations.push({ priority: "P1", title: "引入双周吞吐复盘", action: "把吞吐下降拆到需求质量、评审时延、返工率三个维度，形成责任闭环。", upgrade: "从被动看报表升级为原因-动作-结果的持续优化机制。" });
    if (!serviceHealthy) recommendations.push({ priority: "P0", title: "设置发布前基础服务健康门", action: "将服务状态检查纳入发布 Checklist，不通过时自动阻断发版。", upgrade: "把运维稳定性从人工经验升级为系统门禁。" });
    if (recommendations.length === 0) recommendations.push({ priority: "P2", title: "推进迭代后评估标准化", action: "每个完成迭代产出复盘纪要，沉淀可复用模板与失败案例。", upgrade: "提升组织学习效率，减少同类问题重复出现。" });

    return { healthScore, healthLevel, completionRate, lowProgressRatio, throughputDelta, insights, recommendations };
  }, [displayStatus, scopeCompleted, scopeInProgress, scopeIterationCount, scopeMonthlyTrend, scopeProgressBuckets, serviceHealthy]);

  return {
    insightScope,
    setInsightScope,
    selectedProjectId,
    loadingIterations,
    scopeIterationCount,
    scopeCompleted,
    scopeInProgress,
    scopeProgressBuckets,
    scopeMonthlyTrend,
    insightModel
  };
}
