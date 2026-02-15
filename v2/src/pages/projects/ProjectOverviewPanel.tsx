import type { Iteration, Project, StatusPayload } from "../../domain/workspace/types";

type ProjectOverviewPanelProps = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  iterations: Iteration[];
  projectProgress: number;
  modelPageCount: number;
  modelRuleCount: number;
  modelEntityCount: number;
  status: StatusPayload | null;
  error: string | null;
  onShowCreateIteration: () => void;
  onEnterIteration: (iterationId: number) => void;
};

export function ProjectOverviewPanel({
  currentProject,
  currentIteration,
  iterations,
  projectProgress,
  modelPageCount,
  modelRuleCount,
  modelEntityCount,
  status,
  error,
  onShowCreateIteration,
  onEnterIteration
}: ProjectOverviewPanelProps) {
  return (
    <article className="panel preview-panel context-panel project-overview-panel">
      <div className="panel-head">
        <h2>项目面板</h2>
      </div>
      <div className="preview-scroll">
        <div className="info-box">
          <h3>项目概览</h3>
          <p>项目：{currentProject?.name || "未选择项目"}</p>
          <p>总迭代数：{iterations.length}</p>
          <p>完成进度：{projectProgress}%</p>
          <p>生成代码量：{modelPageCount * 1200}</p>
          <div className="progress-bar">
            <div className="progress-value" style={{ width: `${projectProgress}%` }} />
          </div>
        </div>
        <div className="info-box">
          <div className="panel-head tight">
            <h3>版本列表（迭代版本）</h3>
            <button className="btn ghost mini" onClick={onShowCreateIteration} disabled={!currentProject}>
              新增迭代
            </button>
          </div>
          {iterations.length === 0 ? (
            <p className="hint">暂无迭代版本</p>
          ) : (
            <ul className="iteration-list">
              {iterations.map((item) => (
                <li key={item.id} className={item.id === currentIteration?.id ? "active" : ""}>
                  <button type="button" onClick={() => onEnterIteration(item.id)}>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                    <span>{`状态: ${item.status} · 进度: ${item.progress}%`}</span>
                    <span className="linkish">进入版本</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="info-box">
          <h3>项目文档</h3>
          <div className="doc-item">产品需求文档</div>
          <div className="doc-item">API接口文档</div>
        </div>
        <div className="info-box">
          <h3>运行状态</h3>
          {status && (
            <p>
              服务：{status.service} · 状态：{status.status}
            </p>
          )}
          {error && <p className="error-inline">{error}</p>}
          <p>
            统一模型：实体 {modelEntityCount} / 规则 {modelRuleCount} / 页面 {modelPageCount}
          </p>
        </div>
      </div>
    </article>
  );
}
