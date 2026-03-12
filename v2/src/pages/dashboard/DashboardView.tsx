import type { Project, StatusPayload } from "../../domain/workspace/types";
import { useEffect, useMemo, useState } from "react";
import { useDashboardInsights, type ProgressBucket, type TrendPoint } from "./useDashboardInsights";
import { DashboardInsightFilterSection, RecentProjectsPagination } from "./dashboardViewSections";

type DashboardViewProps = {
  projects: Project[];
  inProgressIterations: number;
  completedIterations: number;
  status: StatusPayload | null;
  progressBuckets: ProgressBucket[];
  iterationCount: number;
  monthlyTrend: TrendPoint[];
  currentProjectId: number | null;
  currentProjectIterations: number;
  onViewProjects: () => void;
};

type DashboardStatCard = {
  key: string;
  label: string;
  value: string;
  icon: string;
  meta: string;
  status?: "ok" | "warn";
};

export function DashboardView({
  projects,
  inProgressIterations,
  completedIterations,
  status,
  progressBuckets,
  iterationCount,
  monthlyTrend,
  currentProjectId,
  currentProjectIterations,
  onViewProjects
}: DashboardViewProps) {
  const normalizedStatus = (status?.status || "").toLowerCase();
  const serviceHealthy = normalizedStatus === "ok";
  const statusLabelMap: Record<string, string> = { ok: "正常", offline: "离线", degraded: "降级" };
  const displayStatus = statusLabelMap[normalizedStatus] || "未获取";
  const displayHealthHint = normalizedStatus ? (serviceHealthy ? "运行正常" : "待关注") : "未检测";
  const pageSizeStorageKey = "dashboard.recentProjects.pageSize";
  const [recentPageSize, setRecentPageSize] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 5;
    }
    const cached = Number.parseInt(window.localStorage.getItem(pageSizeStorageKey) || "", 10);
    return Number.isFinite(cached) && cached > 0 ? cached : 5;
  });
  const [recentPage, setRecentPage] = useState(1);
  const recentTotalPages = Math.max(1, Math.ceil(projects.length / Math.max(recentPageSize, 1)));
  const recentVisibleProjects = useMemo(() => {
    const start = (recentPage - 1) * recentPageSize;
    return projects.slice(start, start + recentPageSize);
  }, [projects, recentPage, recentPageSize]);

  useEffect(() => {
    setRecentPage((current) => Math.min(Math.max(current, 1), recentTotalPages));
  }, [recentTotalPages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(pageSizeStorageKey, String(recentPageSize));
    }
  }, [recentPageSize]);

  const insight = useDashboardInsights({
    projects,
    currentProjectId,
    fallbackInProgress: inProgressIterations,
    fallbackCompleted: completedIterations,
    fallbackIterationCount: iterationCount,
    fallbackProgressBuckets: progressBuckets,
    fallbackMonthlyTrend: monthlyTrend,
    serviceHealthy,
    displayStatus
  });
  const statCards: DashboardStatCard[] = [
    { key: "projects", label: "项目总数", value: String(projects.length), icon: "▣", meta: "全量" },
    { key: "progress", label: "进行中 / 已完成", value: `${insight.scopeInProgress} / ${insight.scopeCompleted}`, icon: "↻", meta: "本期" },
    { key: "service", label: "服务状态", value: displayStatus, icon: "●", meta: displayHealthHint, status: serviceHealthy ? "ok" : "warn" },
    {
      key: "health",
      label: "健康分",
      value: String(insight.insightModel.healthScore),
      icon: "♥",
      meta: insight.insightModel.healthLevel,
      status: insight.insightModel.healthScore >= 80 ? "ok" : "warn"
    }
  ] as const;
  const weekLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const weeklyBars = useMemo(() => {
    const total = Math.max(insight.scopeIterationCount, 1);
    const base = [0, 0, 0, 0, 0, 0, 0].map((_, index) => {
      const source = insight.scopeProgressBuckets[index % Math.max(insight.scopeProgressBuckets.length, 1)];
      const ratio = source ? source.count / total : 0;
      return Math.max(16, Math.round(ratio * 100));
    });
    return weekLabels.map((label, index) => ({
      label,
      value: base[index],
      ghost: Math.min(96, base[index] + (index % 3) * 14 + 10)
    }));
  }, [insight.scopeIterationCount, insight.scopeProgressBuckets]);
  const trendPoints = useMemo(() => {
    const source = insight.scopeMonthlyTrend.length > 0 ? insight.scopeMonthlyTrend : [{ label: "M1", count: 1 }];
    const max = Math.max(...source.map((item) => item.count), 1);
    return source.map((item, index) => {
      const x = source.length === 1 ? 0 : (index / (source.length - 1)) * 100;
      const y = 100 - Math.round((item.count / max) * 72 + 14);
      return { x, y, label: item.label.slice(5) };
    });
  }, [insight.scopeMonthlyTrend]);
  const trendPolyline = trendPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const trendArea = `0,100 ${trendPolyline} 100,100`;
  const selectedInsightProjectName = useMemo(() => {
    if (insight.selectedInsightProjectId === null) {
      return "";
    }
    return projects.find((item) => item.id === insight.selectedInsightProjectId)?.name || "";
  }, [insight.selectedInsightProjectId, projects]);
  const scopeSummary =
    insight.insightScope === "project"
      ? `已选项目：${selectedInsightProjectName || "未选择"}，共 ${insight.scopeIterationCount} 个迭代。`
      : `跨项目聚合视角：覆盖 ${projects.length} 个项目、${insight.scopeIterationCount} 个迭代。`;
  const windowSummary = insight.insightWindowDays === 30 ? "近30天" : "近90天";

  return (
    <section className="dashboard-view">
      <section className="stats-grid">
        {statCards.map((item) => (
          <article key={item.key} className="stat-card">
            <div className="stat-card-head">
              <span className="stat-card-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="stat-card-meta">{item.meta}</span>
            </div>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
            {item.status ? <span className={`status-chip ${item.status}`}>{item.meta}</span> : null}
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <h2>项目进度分布</h2>
          <div className="weekday-chart">
            {weeklyBars.map((item) => (
              <div key={item.label} className="weekday-col">
                <div className="weekday-bars">
                  <div className="weekday-ghost" style={{ height: `${item.ghost}%` }} />
                  <div className="weekday-fill" style={{ height: `${item.value}%` }} />
                </div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel chart-panel">
          <h2>月度代码生成趋势</h2>
          <div className="line-trend-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(59,130,246,.32)" />
                  <stop offset="100%" stopColor="rgba(59,130,246,.08)" />
                </linearGradient>
              </defs>
              <polygon points={trendArea} fill="url(#trendFill)" />
              <polyline points={trendPolyline} fill="none" stroke="#1d4ed8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              {trendPoints.map((point) => (
                <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="1.7" fill="#2563eb" stroke="#fff" strokeWidth=".7" />
              ))}
            </svg>
            <div className="line-trend-labels">
              {trendPoints.map((point) => (
                <span key={`label-${point.label}-${point.x}`}>{point.label || "--"}</span>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-head">
          <h2>最近项目</h2>
          <button type="button" className="btn ghost mini" onClick={onViewProjects}>
            查看全部
          </button>
        </div>
        <div className="recent-table-wrap">
          <table className="recent-table">
            <thead>
              <tr>
                <th>项目名称</th>
                <th>状态</th>
                <th>迭代数</th>
                <th>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">暂无项目数据，请前往项目工作台创建。</div>
                  </td>
                </tr>
              ) : (
                recentVisibleProjects.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.status}</td>
                    <td>{item.id === currentProjectId ? currentProjectIterations : "-"}</td>
                    <td>{item.lastUpdated || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <RecentProjectsPagination
          hasProjects={projects.length > 0}
          recentPageSize={recentPageSize}
          recentPage={recentPage}
          recentTotalPages={recentTotalPages}
          onChangeRecentPageSize={(value) => {
            setRecentPageSize(value);
            setRecentPage(1);
          }}
          onPrevPage={() => setRecentPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setRecentPage((prev) => Math.min(recentTotalPages, prev + 1))}
        />
      </section>

      <DashboardInsightFilterSection
        projects={projects}
        insightScope={insight.insightScope}
        insightWindowDays={insight.insightWindowDays}
        selectedInsightProjectId={insight.selectedInsightProjectId}
        loadingIterations={insight.loadingIterations}
        onChangeInsightScope={insight.setInsightScope}
        onChangeInsightWindowDays={insight.setInsightWindowDays}
        onChangeSelectedProjectId={insight.setSelectedInsightProjectId}
      />

      <section className="panel insight-panel">
        <div className="panel-head">
          <h2>项目进展深度洞察</h2>
          <p className="hint">
            当前聚焦：{scopeSummary} 统计窗口：{windowSummary}。
          </p>
        </div>
        <div className="insight-kpis">
          <span>完成率：{Math.round(insight.insightModel.completionRate * 100)}%</span>
          <span>低进度占比：{Math.round(insight.insightModel.lowProgressRatio * 100)}%</span>
          <span>吞吐变化：{`${insight.insightModel.throughputDelta >= 0 ? "+" : ""}${Math.round(insight.insightModel.throughputDelta * 100)}%`}</span>
        </div>
        <div className="insight-list">
          {insight.insightModel.insights.map((item) => (
            <article key={item.title} className={`insight-item ${item.level}`}>
              <h3>{item.title}</h3>
              <p>{item.finding}</p>
              <p className="hint">影响：{item.impact}</p>
            </article>
          ))}
        </div>
        <section className="insight-actions-panel" aria-label="行动建议看板">
          <div className="panel-head">
            <h2>行动建议看板</h2>
            <p className="hint">将诊断结果映射为可执行动作，避免与“深度洞察”重复叙述。</p>
          </div>
          <div className="insight-actions-list">
            {insight.insightModel.recommendations.slice(0, 4).map((item) => (
              <article key={item.title} className="insight-action-item">
                <h3>
                  [{item.priority}] {item.title}
                </h3>
                <p className="insight-side-tag">适用范围：{item.scopeLabel}</p>
                <p>{item.action}</p>
                <p className="hint">升级方式：{item.upgrade}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </section>
  );
}
