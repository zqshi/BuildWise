import type { ChangeEvent, RefObject } from "react";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  Project,
  StatusPayload
} from "../../domain/workspace/types";
import { IterationWorkspacePanel } from "./IterationWorkspacePanel";
import { ProjectOverviewPanel } from "./ProjectOverviewPanel";

type ProjectsWorkspaceProps = {
  projects: Project[];
  currentProjectId: number | null;
  currentProject: Project | null;
  currentIteration: Iteration | null;
  iterations: Iteration[];
  projectPanelMode: "project" | "iteration";
  projectProgress: number;
  modelPageCount: number;
  modelRuleCount: number;
  modelEntityCount: number;
  status: StatusPayload | null;
  error: string | null;
  uploadedFile: { name: string; iterationId: number } | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  contextData: IterationContextPayload | null;
  chatMessages: IterationMessage[];
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onShowCreateProject: () => void;
  onShowCreateIteration: () => void;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onSelectProject: (projectId: number) => void;
  onEnterIteration: (iterationId: number) => void;
  onSwitchToProjectPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatInputChange: (value: string) => void;
  onChatSend: () => void;
};

export function ProjectsWorkspace({
  projects,
  currentProjectId,
  currentProject,
  currentIteration,
  iterations,
  projectPanelMode,
  projectProgress,
  modelPageCount,
  modelRuleCount,
  modelEntityCount,
  status,
  error,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  contextData,
  chatMessages,
  chatInput,
  fileInputRef,
  onShowCreateProject,
  onShowCreateIteration,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onSelectProject,
  onEnterIteration,
  onSwitchToProjectPanel,
  onUpload,
  onChatInputChange,
  onChatSend
}: ProjectsWorkspaceProps) {
  const hasProjects = projects.length > 0;
  const showWorkspaceHero = projectPanelMode !== "iteration";

  return (
    <section className="projects-view">
      {showWorkspaceHero ? (
        <header className="hero-panel compact">
          <div>
            <p className="hero-kicker">项目工作台</p>
            <h1>{currentProject?.name || "项目管理"}</h1>
            <p className="hero-sub">
              {currentProject ? `${currentProject.description || "暂无描述"}` : "请选择项目后开始迭代"}
            </p>
          </div>
        </header>
      ) : null}
      {!hasProjects ? (
        <section className="workspace-empty">
          <article className="panel project-empty-panel">
            <div className="project-empty-content">
              <div className="empty-illustration" aria-hidden="true">
                ⬡
              </div>
              <h2>欢迎进入项目管理</h2>
              <p>当前还没有项目。请先创建一个项目，然后在右侧项目面板中继续新增迭代版本。</p>
              <button className="btn primary" onClick={onShowCreateProject}>
                立即创建项目
              </button>
            </div>
          </article>
        </section>
      ) : (
        projectPanelMode === "project" ? (
          <section className="workspace-grid project-mode">
            <article className="panel project-panel">
              <div className="panel-head">
                <h2>项目列表</h2>
              </div>
              <ul className="project-list">
                {projects.map((item) => (
                  <li key={item.id} className={item.id === currentProjectId ? "active" : ""}>
                    <button
                      type="button"
                      className="project-list-btn"
                      onClick={() => onSelectProject(item.id)}
                      aria-current={item.id === currentProjectId}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.description || "暂无描述"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="project-list-foot sticky">
                <button className="btn primary" onClick={onShowCreateProject}>
                  新建项目
                </button>
              </div>
            </article>
            <ProjectOverviewPanel
              currentProject={currentProject}
              currentIteration={currentIteration}
              iterations={iterations}
              projectProgress={projectProgress}
              modelPageCount={modelPageCount}
              modelRuleCount={modelRuleCount}
              modelEntityCount={modelEntityCount}
              status={status}
              error={error}
              onShowCreateIteration={onShowCreateIteration}
              onEnterIteration={onEnterIteration}
            />
          </section>
        ) : (
          <section className={`workspace-grid iteration-standalone ${showAnalysisPanel ? "analysis-open" : ""}`}>
            <IterationWorkspacePanel
              currentIteration={currentIteration}
              contextData={contextData}
              chatMessages={chatMessages}
              chatInput={chatInput}
              fileInputRef={fileInputRef}
              uploadedFile={uploadedFile}
              analysisReport={analysisReport}
              showAnalysisPanel={showAnalysisPanel}
              isAnalyzingAttachment={isAnalyzingAttachment}
              onUploadClick={onUploadClick}
              onOpenAnalysisPanel={onOpenAnalysisPanel}
              onCloseAnalysisPanel={onCloseAnalysisPanel}
              onUpload={onUpload}
              onChatInputChange={onChatInputChange}
              onChatSend={onChatSend}
              onSwitchToProjectPanel={onSwitchToProjectPanel}
            />
          </section>
        )
      )}
    </section>
  );
}
