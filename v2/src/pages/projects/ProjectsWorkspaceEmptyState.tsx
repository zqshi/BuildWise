type ProjectsWorkspaceEmptyStateProps = {
  mode: "loading" | "error" | "empty";
  error?: string | null;
  backendUnavailable?: boolean;
  onShowCreateProject: () => void;
};

export function ProjectsWorkspaceEmptyState({
  mode,
  error = null,
  backendUnavailable = false,
  onShowCreateProject
}: ProjectsWorkspaceEmptyStateProps) {
  if (mode === "loading") {
    return (
      <section className="workspace-empty">
        <article className="panel project-empty-panel">
          <div className="project-empty-content">
            <div className="empty-illustration" aria-hidden="true">
              …
            </div>
            <h2>正在加载项目</h2>
            <p>项目和版本数据正在同步，请稍候后再继续操作。</p>
          </div>
        </article>
      </section>
    );
  }

  if (mode === "error") {
    return (
      <section className="workspace-empty">
        <article className="panel project-empty-panel">
          <div className="project-empty-content">
            <div className="empty-illustration" aria-hidden="true">
              !
            </div>
            <h2>项目数据加载失败</h2>
            <p>无法确认当前账号下的项目列表，请刷新页面或重新登录后重试。</p>
            <p>{error}</p>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="workspace-empty">
      <article className="panel project-empty-panel">
        <div className="project-empty-content">
          <div className="empty-illustration" aria-hidden="true">
            ⬡
          </div>
          <h2>欢迎进入项目管理</h2>
          <p>当前还没有项目。请先创建一个项目，然后在右侧项目面板中继续新增迭代版本。</p>
          <button
            className="btn primary"
            onClick={onShowCreateProject}
            disabled={backendUnavailable}
            title={backendUnavailable ? "后端服务未连接，暂不可创建项目" : undefined}
          >
            立即创建项目
          </button>
        </div>
      </article>
    </section>
  );
}
