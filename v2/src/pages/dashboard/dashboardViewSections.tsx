import type { Project } from "../../domain/workspace/types";

type DashboardInsightFilterSectionProps = {
  projects: Project[];
  insightScope: "project" | "portfolio";
  insightWindowDays: 30 | 90;
  selectedInsightProjectId: number | null;
  loadingIterations: boolean;
  onChangeInsightScope: (value: "project" | "portfolio") => void;
  onChangeInsightWindowDays: (value: 30 | 90) => void;
  onChangeSelectedProjectId: (value: number | null) => void;
};

type RecentProjectsPaginationProps = {
  hasProjects: boolean;
  recentPageSize: number;
  recentPage: number;
  recentTotalPages: number;
  onChangeRecentPageSize: (value: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function DashboardInsightFilterSection({
  projects,
  insightScope,
  insightWindowDays,
  selectedInsightProjectId,
  loadingIterations,
  onChangeInsightScope,
  onChangeInsightWindowDays,
  onChangeSelectedProjectId
}: DashboardInsightFilterSectionProps) {
  return (
    <section className="panel insight-filter-panel">
      <div className="panel-head">
        <h2>洞察分析筛选</h2>
        <p className="hint">筛选项统一置于洞察顶部，用于驱动下方诊断与行动方案。</p>
      </div>
      <div className="insight-filter-grid">
        <label className="insight-scope-field">
          分析维度
          <select value={insightScope} onChange={(event) => onChangeInsightScope(event.target.value as "project" | "portfolio")}>
            <option value="project">项目维度</option>
            <option value="portfolio">跨项目维度</option>
          </select>
        </label>
        <label className="insight-scope-field">
          时间窗口
          <select
            value={insightWindowDays}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              onChangeInsightWindowDays(next === 30 ? 30 : 90);
            }}
          >
            <option value={30}>近30天</option>
            <option value={90}>近90天</option>
          </select>
        </label>
        {insightScope === "project" ? (
          <label className="insight-scope-field">
            选择项目
            <select
              value={selectedInsightProjectId ?? ""}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                onChangeSelectedProjectId(Number.isFinite(next) ? next : null);
              }}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="insight-scope-hint">当前洞察基于全部项目聚合数据。</p>
        )}
        {loadingIterations ? <p className="insight-scope-hint">正在加载洞察数据…</p> : null}
      </div>
    </section>
  );
}

export function RecentProjectsPagination({
  hasProjects,
  recentPageSize,
  recentPage,
  recentTotalPages,
  onChangeRecentPageSize,
  onPrevPage,
  onNextPage
}: RecentProjectsPaginationProps) {
  if (!hasProjects) {
    return null;
  }
  return (
    <div className="recent-pagination">
      <label className="recent-page-size">
        每页
        <select
          value={recentPageSize}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(next) && next > 0) {
              onChangeRecentPageSize(next);
            }
          }}
        >
          {[5, 10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        条
      </label>
      <span className="recent-page-indicator">
        第 {recentPage} / {recentTotalPages} 页
      </span>
      <div className="recent-pagination-actions">
        <button type="button" className="btn ghost mini" onClick={onPrevPage} disabled={recentPage <= 1}>
          上一页
        </button>
        <button type="button" className="btn ghost mini" onClick={onNextPage} disabled={recentPage >= recentTotalPages}>
          下一页
        </button>
      </div>
    </div>
  );
}
