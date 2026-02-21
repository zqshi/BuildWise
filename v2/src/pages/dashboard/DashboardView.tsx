import type { Project, StatusPayload } from "../../domain/workspace/types";

type ProgressBucket = { label: string; count: number };
type TrendPoint = { label: string; count: number };

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
  const statusLabelMap: Record<string, string> = {
    ok: "正常",
    offline: "离线",
    degraded: "降级"
  };
  const displayStatus = statusLabelMap[normalizedStatus] || "未获取";
  const displayHealthHint = normalizedStatus ? (serviceHealthy ? "运行正常" : "待关注") : "未检测";

  return (
    <section className="dashboard-view">
      <header className="hero-panel">
        <div>
          <p className="hero-kicker">构想智造 / AI驱动构建平台</p>
          <h1>仪表盘</h1>
          <p className="hero-sub">系统概览和统计信息</p>
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
          <strong>{inProgressIterations}</strong>
        </article>
        <article className="stat-card">
          <p>已完成迭代</p>
          <strong>{completedIterations}</strong>
        </article>
        <article className="stat-card">
          <p>服务状态</p>
          <strong>{displayStatus}</strong>
          <span className={`status-chip ${serviceHealthy ? "ok" : "warn"}`}>{displayHealthHint}</span>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <h2>项目进度分布</h2>
          <div className="bar-chart">
            {progressBuckets.map((item) => (
              <div key={item.label} className="bar-row">
                <span>{item.label}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(10, Math.round((item.count / Math.max(iterationCount, 1)) * 100))}%`
                    }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel chart-panel">
          <h2>月度代码生成趋势</h2>
          <div className="trend-chart">
            {monthlyTrend.map((item) => (
              <div key={item.label} className="trend-col">
                <div
                  className="trend-fill"
                  style={{
                    height: `${Math.max(
                      8,
                      Math.round((item.count / Math.max(...monthlyTrend.map((point) => point.count), 1)) * 100)
                    )}%`
                  }}
                />
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
    </section>
  );
}
