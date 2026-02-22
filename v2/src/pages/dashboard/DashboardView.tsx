import type { Project, StatusPayload } from "../../domain/workspace/types";
import { useDashboardInsights, type ProgressBucket, type TrendPoint } from "./useDashboardInsights";

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
  onSelectProject: (projectId: number) => void;
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
  onViewProjects,
  onSelectProject
}: DashboardViewProps) {
  const normalizedStatus = (status?.status || "").toLowerCase();
  const serviceHealthy = normalizedStatus === "ok";
  const statusLabelMap: Record<string, string> = { ok: "正常", offline: "离线", degraded: "降级" };
  const displayStatus = statusLabelMap[normalizedStatus] || "未获取";
  const displayHealthHint = normalizedStatus ? (serviceHealthy ? "运行正常" : "待关注") : "未检测";
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

  return (
    <section className="dashboard-view">
      <header className="hero-panel">
        <div>
          <p className="hero-kicker">构想智造 / AI驱动构建平台</p>
          <h1>仪表盘</h1>
          <p className="hero-sub">系统概览、趋势洞察与升级建议</p>
        </div>
        <div className="hero-actions">
          <button className="btn ghost" onClick={onViewProjects}>
            查看项目工作台
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <p>总项目数</p>
          <strong>{projects.length}</strong>
        </article>
        <article className="stat-card">
          <p>进行中迭代</p>
          <strong>{insight.scopeInProgress}</strong>
        </article>
        <article className="stat-card">
          <p>已完成迭代</p>
          <strong>{insight.scopeCompleted}</strong>
        </article>
        <article className="stat-card">
          <p>服务状态</p>
          <strong>{displayStatus}</strong>
          <span className={`status-chip ${serviceHealthy ? "ok" : "warn"}`}>{displayHealthHint}</span>
        </article>
        <article className="stat-card">
          <p>交付健康度</p>
          <strong>{insight.insightModel.healthScore}</strong>
          <span className={`status-chip ${insight.insightModel.healthScore >= 80 ? "ok" : "warn"}`}>{insight.insightModel.healthLevel}</span>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <h2>项目进度分布</h2>
          <div className="bar-chart">
            {insight.scopeProgressBuckets.map((item) => (
              <div key={item.label} className="bar-row">
                <span>{item.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(10, Math.round((item.count / Math.max(insight.scopeIterationCount, 1)) * 100))}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel chart-panel">
          <h2>月度代码生成趋势</h2>
          <div className="trend-chart">
            {insight.scopeMonthlyTrend.map((item) => (
              <div key={item.label} className="trend-col">
                <div className="trend-fill" style={{ height: `${Math.max(8, Math.round((item.count / Math.max(...insight.scopeMonthlyTrend.map((point) => point.count), 1)) * 100))}%` }} />
                <span>{item.label.slice(5)}</span>
              </div>
            ))}
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
                projects.map((item) => (
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
      </section>

      <section className="panel insight-panel">
        <div className="panel-head">
          <h2>洞察维度</h2>
          <div className="hero-actions">
            <button type="button" className={`btn mini ${insight.insightScope === "project" ? "primary" : "ghost"}`} onClick={() => insight.setInsightScope("project")}>
              项目维度
            </button>
            <button type="button" className={`btn mini ${insight.insightScope === "portfolio" ? "primary" : "ghost"}`} onClick={() => insight.setInsightScope("portfolio")}>
              跨项目维度
            </button>
          </div>
        </div>
        <div className="insight-kpis">
          <span>当前模式：{insight.insightScope === "project" ? "单项目" : "跨项目聚合"}</span>
          <span>数据状态：{insight.loadingIterations ? "加载中" : "已就绪"}</span>
          {insight.insightScope === "project" ? (
            <label>
              项目选择：
              <select value={insight.selectedProjectId ?? ""} onChange={(event) => onSelectProject(Number(event.target.value))} disabled={projects.length === 0}>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="panel insight-panel">
        <div className="panel-head">
          <h2>项目进展深度洞察</h2>
          <p className="hint">
            当前聚焦：
            {insight.insightScope === "project"
              ? `已选项目（ID: ${insight.selectedProjectId ?? "未选择"}）迭代视角，共 ${insight.scopeIterationCount || currentProjectIterations} 个迭代。`
              : `跨项目聚合视角，覆盖 ${projects.length} 个项目、${insight.scopeIterationCount} 个迭代。`}
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
      </section>

      <section className="panel recent-panel">
        <div className="panel-head">
          <h2>升级优化建议</h2>
        </div>
        <div className="insight-list">
          {insight.insightModel.recommendations.map((item) => (
            <article key={item.title} className="insight-item watch">
              <h3>
                [{item.priority}] {item.title}
              </h3>
              <p>{item.action}</p>
              <p className="hint">升级方式：{item.upgrade}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
