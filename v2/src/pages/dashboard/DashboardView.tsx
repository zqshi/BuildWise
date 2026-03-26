import type { Project, StatusPayload } from "../../domain/workspace/types";
import { useEffect, useMemo, useState } from "react";
import { buildProgressBarDetails, buildTrendChartPoints, hasProgressDistributionData, hasTrendData } from "./dashboardChartModel";
import { useDashboardInsights, type ProgressBucket, type TrendPoint } from "./useDashboardInsights";
import { DashboardInsightFilterSection, RecentProjectsPagination } from "./dashboardViewSections";

type DashboardViewProps = {
  projects: Project[];
  projectsHydrated: boolean;
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

type ChartTooltipState = {
  title: string;
  detail: string;
  x: number;
  y: number;
};

const actionPriorityMeta: Record<string, { label: string; tone: "critical" | "high" | "medium" | "routine" }> = {
  P0: { label: "立即处理", tone: "critical" },
  P1: { label: "高优先级", tone: "high" },
  P2: { label: "持续跟进", tone: "medium" },
  P3: { label: "常规优化", tone: "routine" }
};

export function DashboardView({
  projects,
  projectsHydrated,
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
  const progressBars = useMemo(
    () => buildProgressBarDetails(insight.scopeProgressBuckets, insight.scopeIterationCount),
    [insight.scopeIterationCount, insight.scopeProgressBuckets]
  );
  const trendPoints = useMemo(() => buildTrendChartPoints(insight.scopeMonthlyTrend), [insight.scopeMonthlyTrend]);
  const hasProgressData = hasProgressDistributionData(insight.scopeProgressBuckets);
  const hasTrendChartData = hasTrendData(insight.scopeMonthlyTrend);
  const trendPolyline = trendPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const trendArea = `0,100 ${trendPolyline} 100,100`;
  const [activeProgressBarLabel, setActiveProgressBarLabel] = useState(progressBars[0]?.label ?? "");
  const [activeTrendPointLabel, setActiveTrendPointLabel] = useState(trendPoints[trendPoints.length - 1]?.label ?? "");
  const [progressTooltip, setProgressTooltip] = useState<ChartTooltipState | null>(null);
  const [trendTooltip, setTrendTooltip] = useState<ChartTooltipState | null>(null);

  useEffect(() => {
    setActiveProgressBarLabel(progressBars[0]?.label ?? "");
  }, [progressBars]);

  useEffect(() => {
    setActiveTrendPointLabel(trendPoints[trendPoints.length - 1]?.label ?? "");
  }, [trendPoints]);

  const activeProgressBar = progressBars.find((item) => item.label === activeProgressBarLabel) ?? progressBars[0] ?? null;
  const activeTrendPoint = trendPoints.find((item) => item.label === activeTrendPointLabel) ?? trendPoints[trendPoints.length - 1] ?? null;
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
  const hasInsightData = insight.hasScopeIterations && insight.insightModel.insights.length > 0;
  const hasRecommendationData = insight.hasScopeIterations && insight.insightModel.recommendations.length > 0;
  const showProgressTooltip = (title: string, detail: string, x: number, y: number) => setProgressTooltip({ title, detail, x, y });
  const showTrendTooltip = (title: string, detail: string, x: number, y: number) => setTrendTooltip({ title, detail, x, y });

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
          {hasProgressData ? (
            <>
              <div className="chart-guide-text">悬停柱状条查看分布详情。</div>
              <div className="chart-surface">
                <div className="weekday-chart" aria-label="项目进度分布柱状图">
                  {progressBars.map((item) => (
                    <div
                      key={item.label}
                      className={`weekday-col ${activeProgressBar?.label === item.label ? "active" : ""}`}
                      onMouseEnter={(event) => {
                        setActiveProgressBarLabel(item.label);
                        showProgressTooltip(item.label, item.detail, event.currentTarget.offsetLeft + event.currentTarget.offsetWidth / 2, 16);
                      }}
                      onMouseMove={(event) => {
                        showProgressTooltip(item.label, item.detail, event.currentTarget.offsetLeft + event.currentTarget.offsetWidth / 2, 16);
                      }}
                      onMouseLeave={() => setProgressTooltip(null)}
                      onFocus={(event) => {
                        setActiveProgressBarLabel(item.label);
                        showProgressTooltip(item.label, item.detail, event.currentTarget.offsetLeft + event.currentTarget.offsetWidth / 2, 16);
                      }}
                      onBlur={() => setProgressTooltip(null)}
                      tabIndex={0}
                      role="button"
                      aria-label={item.detail}
                      aria-describedby="dashboard-progress-tooltip"
                    >
                      <div className="weekday-bars">
                        <div className="weekday-ghost" style={{ height: "100%" }} />
                        <div className="weekday-fill" style={{ height: `${item.height}%` }} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                {progressTooltip ? (
                  <div
                    id="dashboard-progress-tooltip"
                    className="chart-tooltip"
                    role="status"
                    style={{ left: `${progressTooltip.x}px`, top: `${progressTooltip.y}px` }}
                  >
                    <strong>{progressTooltip.title}</strong>
                    <span>{progressTooltip.detail}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="dashboard-empty-state chart-empty-state" role="status">
              <div className="dashboard-empty-illustration" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>当前暂无迭代进度数据</strong>
            </div>
          )}
        </article>
        <article className="panel chart-panel">
          <h2>月度代码生成趋势</h2>
          {hasTrendChartData ? (
            <>
              <div className="chart-guide-text">悬停折线节点查看趋势详情。</div>
              <div className="chart-surface">
                <div className="line-trend-chart">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="月度代码生成趋势折线图">
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(59,130,246,.32)" />
                        <stop offset="100%" stopColor="rgba(59,130,246,.08)" />
                      </linearGradient>
                    </defs>
                    <polygon points={trendArea} fill="url(#trendFill)" />
                    <polyline points={trendPolyline} fill="none" stroke="#1d4ed8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    {trendPoints.map((point) => (
                      <g
                        key={`${point.label}-${point.x}`}
                        className={activeTrendPoint?.label === point.label ? "trend-point-group active" : "trend-point-group"}
                        onMouseEnter={() => {
                          setActiveTrendPointLabel(point.label);
                          showTrendTooltip(point.label, point.detail, point.x, 16);
                        }}
                        onMouseLeave={() => setTrendTooltip(null)}
                        onFocus={() => {
                          setActiveTrendPointLabel(point.label);
                          showTrendTooltip(point.label, point.detail, point.x, 16);
                        }}
                        onBlur={() => setTrendTooltip(null)}
                        tabIndex={0}
                        role="button"
                        aria-label={point.detail}
                        aria-describedby="dashboard-trend-tooltip"
                      >
                        <circle cx={point.x} cy={point.y} r="4.5" fill="transparent" />
                        <circle cx={point.x} cy={point.y} r="1.7" fill="#2563eb" stroke="#fff" strokeWidth=".7" />
                      </g>
                    ))}
                  </svg>
                  <div className="line-trend-labels">
                    {trendPoints.map((point) => (
                      <span key={`label-${point.label}-${point.x}`} className={activeTrendPoint?.label === point.label ? "active" : ""}>
                        {point.label || "--"}
                      </span>
                    ))}
                  </div>
                </div>
                {trendTooltip ? (
                  <div
                    id="dashboard-trend-tooltip"
                    className="chart-tooltip chart-tooltip-trend"
                    role="status"
                    style={{ left: `${trendTooltip.x}%`, top: `${trendTooltip.y}px` }}
                  >
                    <strong>{trendTooltip.title}</strong>
                    <span>{trendTooltip.detail}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="dashboard-empty-state chart-empty-state" role="status">
              <div className="dashboard-empty-illustration trend" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>当前暂无代码生成趋势数据</strong>
            </div>
          )}
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
                    <div className="empty-state">
                      {projectsHydrated ? "暂无项目数据，请前往项目工作台创建。" : "项目数据加载中，请稍候…"}
                    </div>
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
          <span>吞吐变化：{insight.hasMeaningfulTrend ? `${insight.insightModel.throughputDelta >= 0 ? "+" : ""}${Math.round(insight.insightModel.throughputDelta * 100)}%` : "--"}</span>
        </div>
        <div className="insight-list">
          {hasInsightData ? (
            insight.insightModel.insights.map((item) => (
              <article key={item.title} className={`insight-item ${item.level}`}>
                <h3>{item.title}</h3>
                <p>{item.finding}</p>
                <p className="hint">影响：{item.impact}</p>
              </article>
            ))
          ) : (
            <div className="dashboard-empty-state insight-empty-state insight-empty-state-fill">
              <div className="dashboard-empty-illustration insight" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>当前暂无项目进展洞察</strong>
            </div>
          )}
        </div>
        <section className="insight-actions-panel" aria-label="行动建议看板">
          <div className="panel-head">
            <h2>行动建议看板</h2>
          </div>
          <div className="insight-actions-list">
            {hasRecommendationData ? (
              insight.insightModel.recommendations.slice(0, 4).map((item) => {
                const priorityMeta = actionPriorityMeta[item.priority] ?? { label: item.priority, tone: "routine" as const };
                return (
                  <article key={item.title} className="insight-action-item">
                    <div className="insight-action-head">
                      <div className={`insight-action-badge ${priorityMeta.tone}`} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="insight-action-head-copy">
                        <p className={`insight-action-priority ${priorityMeta.tone}`}>
                          <span>{item.priority}</span>
                          {priorityMeta.label}
                        </p>
                        <h3>{item.title}</h3>
                      </div>
                    </div>
                    <p className="insight-side-tag">适用范围：{item.scopeLabel}</p>
                    <p>{item.action}</p>
                    <p className="hint">升级方式：{item.upgrade}</p>
                  </article>
                );
              })
            ) : (
              <div className="dashboard-empty-state insight-empty-state action-empty-state">
                <div className="dashboard-empty-illustration action" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>当前暂无行动建议</strong>
                <p>建议会按优先级、适用范围和升级路径汇总到这里，便于直接推进下一步。</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}
