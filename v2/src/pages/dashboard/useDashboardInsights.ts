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
      return {
        healthScore: 0,
        healthLevel: "暂无数据",
        completionRate: 0,
        lowProgressRatio: 0,
        throughputDelta: 0,
        insights: [],
        recommendations: []
      };
    }
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
    // Dampen ratio-based penalties when sample size is too small (< 3 iterations)
    // to avoid alarming scores for projects that just started
    const sampleDampen = scopeIterationCount < 3 ? 0.3 : 1;
    const healthPenalty = lowProgressRatio * 35 * sampleDampen + (1 - completionRate) * 25 * sampleDampen + (throughputDelta < -0.15 ? 20 : throughputDelta < 0 ? 10 : 0) + (serviceHealthy ? 0 : 20) + (inProgressRatio > 0.8 && scopeInProgress >= 3 ? 8 : 0);
    const healthScore = clamp(Math.round(100 - healthPenalty), 0, 100);
    const healthLevel = healthScore >= 80 ? "健康" : healthScore >= 60 ? "预警" : "高风险";

    const insights: InsightItem[] = sortInsightsByLevel([
      lowProgressRatio >= 0.45 && lowProgressCount >= 3
        ? { level: "risk", title: "\u524d\u6bb5\u79ef\u538b\u504f\u9ad8", finding: `\u4f4e\u8fdb\u5ea6\u8fed\u4ee3\u5360\u6bd4 ${formatPercent(lowProgressRatio)}\uff0c\u9700\u6c42\u88ab\u5207\u5c0f\u4f46\u5173\u5355\u901f\u5ea6\u4e0d\u8db3\u3002`, impact: "\u4f1a\u6301\u7eed\u63a8\u9ad8\u4e0a\u4e0b\u6587\u5207\u6362\u6210\u672c\uff0c\u62d6\u6162\u4e2d\u540e\u6bb5\u4ea4\u4ed8\u3002" }
        : { level: "good", title: "\u9636\u6bb5\u63a8\u8fdb\u7ed3\u6784\u53ef\u63a7", finding: `\u4f4e\u8fdb\u5ea6\u8fed\u4ee3\u5360\u6bd4 ${formatPercent(lowProgressRatio)}\uff0c\u672a\u51fa\u73b0\u660e\u663e\u201c\u53ea\u5f00\u5de5\u4e0d\u6536\u655b\u201d\u73b0\u8c61\u3002`, impact: "\u53ef\u628a\u6cbb\u7406\u91cd\u5fc3\u653e\u5728\u8d28\u91cf\u95e8\u7981\u548c\u590d\u76d8\u673a\u5236\uff0c\u800c\u975e\u76f2\u76ee\u52a0\u4eba\u3002" },
      trendPoints.length >= 4
        ? { level: throughputDelta < -0.15 ? "risk" : throughputDelta < 0 ? "watch" : "good", title: "交付吞吐趋势", finding: `近3个月迭代产出较前3个月${throughputDelta >= 0 ? "提升" : "下降"}${Math.abs(Math.round(throughputDelta * 100))}%。`, impact: throughputDelta < 0 ? "如果不做流程升级，后续版本节奏会继续下滑。" : "当前节奏可支撑更高密度版本发布。" }
        : { level: "watch", title: "趋势样本偏少", finding: "月度数据不足 4 个样本点，趋势判断可信度有限。", impact: "建议先补齐关键阶段数据，再做容量规划。" },
      { level: scopeInProgress - highProgressCount > 2 ? "watch" : "good", title: "收尾效率", finding: `进行中迭代 ${scopeInProgress} 个，其中高进度待收口 ${highProgressCount} 个。`, impact: scopeInProgress - highProgressCount > 2 ? "说明执行中项目多于可收尾项目，容易形成长期尾项。" : "收口压力可控，可继续推进连续交付。" }
    ]);
    if (!serviceHealthy) {
      insights.push({ level: "risk", title: "平台依赖风险", finding: `服务状态为${displayStatus}，工程面板存在基础依赖不稳定。`, impact: "会放大发布窗口不确定性，影响迭代验收节奏。" });
    }

    const recommendations: RecommendationItem[] = [];
    if (lowProgressRatio >= 0.45 && scopeInProgress >= 3) {
      recommendations.push({
        priority: "P0",
        title: "控制并行迭代数量",
        action: "当前有较多迭代进展缓慢。建议先集中精力完成进行中的迭代，再启动新的。",
        upgrade: "少量聚焦比大量并行更高效。",
        scope: "project",
        scopeLabel: "项目维度"
      });
    }
    if (throughputDelta < 0) {
      recommendations.push({
        priority: "P1",
        title: "关注迭代完成速度下降",
        action: "近期完成的迭代数量在下降。建议回顾是否有需求不清晰、评审时间过长或返工过多的情况。",
        upgrade: "定期复盘有助于发现和解决瓶颈。",
        scope: "both",
        scopeLabel: "项目/跨项目"
      });
    }
    if (!serviceHealthy) {
      recommendations.push({
        priority: "P0",
        title: "关注平台服务状态",
        action: "当前平台基础服务存在异常，建议在发布前确认服务恢复正常。",
        upgrade: "服务稳定是顺利发布的前提。",
        scope: "portfolio",
        scopeLabel: "跨项目维度"
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        priority: "P2",
        title: "建立迭代复盘习惯",
        action: "建议每次迭代完成后做一次简短回顾，记录做得好的和需要改进的。",
        upgrade: "持续积累经验，减少同类问题重复出现。",
        scope: "both",
        scopeLabel: "项目/跨项目"
      });
    }
    const visibleRecommendations = recommendations.filter((item) => item.scope === "both" || item.scope === insightScope);

    return { healthScore, healthLevel, completionRate, lowProgressRatio, throughputDelta, insights: sortInsightsByLevel(insights), recommendations: visibleRecommendations };
  }, [displayStatus, hasScopeIterations, insightScope, scopeCompleted, scopeInProgress, scopeIterationCount, scopeMonthlyTrend, scopeProgressBuckets, serviceHealthy]);

  return {
    insightScope,
    setInsightScope,
    insightWindowDays,
    setInsightWindowDays,
    selectedInsightProjectId,
    setSelectedInsightProjectId,
    loadingIterations,
    scopeIterationCount,
    scopeCompleted,
    scopeInProgress,
    scopeProgressBuckets,
    scopeMonthlyTrend,
    hasScopeIterations,
    hasMeaningfulTrend,
    insightModel
  };
}
