import type { ChangeEvent, RefObject } from "react";
import type { DeploymentRecord, OpsMetricsPayload, TemplateRunHistory, VersionSnapshot } from "../../domain/workspace/platformTypes";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationVisualEditResponse,
  ModelRelationPayload,
  IterationStateMachinePayload,
  IterationStatus,
  Project,
  StatusPayload
} from "../../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
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
  modelRelations?: ModelRelationPayload[];
  versionSnapshots?: VersionSnapshot[];
  templateRuns?: TemplateRunHistory[];
  deployments?: DeploymentRecord[];
  opsMetrics?: OpsMetricsPayload | null;
  status: StatusPayload | null;
  error: string | null;
  uploadedFile: UploadedAttachmentMeta | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onShowCreateProject: () => void;
  onShowCreateIteration: () => void;
  onDeleteProject: (projectId: number) => Promise<void>;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onSelectProject: (projectId: number) => void;
  onEnterIteration: (iterationId: number) => void;
  onSwitchToProjectPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles: (files: File[]) => void;
  onChatInputChange: (value: string) => void;
  onChatSend: (options?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }) => Promise<IterationVisualEditResponse | null>;
  onUpdateClarificationDraft: (resolvedQuestions: string[]) => Promise<void> | void;
  onConfirmIterationAnalysis: (payload: {
    accurate: boolean;
    note?: string;
    resolvedClarificationQuestions?: string[];
    boundary?: {
      requirementRefs?: string[];
      componentRefs?: string[];
      codePaths?: string[];
      note?: string;
    };
  }) => Promise<void> | void;
  onUpdateIterationBoundary: (payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  }) => Promise<void> | void;
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => Promise<void> | void;
  onGenerateTestArtifacts: (dryRun?: boolean) => Promise<void> | void;
  onRefreshReleaseReview: () => Promise<void> | void;
  onTransitionState: (toStatus: IterationStatus) => void;
  onCreateDeployment: (environment: "staging" | "production") => Promise<void>;
  onTransitionDeployment: (deploymentId: number, toStatus: "running" | "success" | "failed") => Promise<void>;
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void;
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
  modelRelations = [],
  versionSnapshots = [],
  templateRuns = [],
  deployments = [],
  opsMetrics = null,
  status,
  error,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  uploadAnalysisProgress,
  contextData,
  stateMachine,
  chatMessages,
  chatInput,
  fileInputRef,
  onShowCreateProject,
  onShowCreateIteration,
  onDeleteProject,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onSelectProject,
  onEnterIteration,
  onSwitchToProjectPanel,
  onUpload,
  onUploadFiles,
  onChatInputChange,
  onChatSend,
  onUpdateClarificationDraft,
  onConfirmIterationAnalysis,
  onUpdateIterationBoundary,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
  onTransitionState,
  onCreateDeployment,
  onTransitionDeployment,
  onPatchUploadedHtmlPreview
}: ProjectsWorkspaceProps) {
  const hasProjects = projects.length > 0;
  const showWorkspaceHero = projectPanelMode !== "iteration";
  const backendUnavailable =
    status?.status === "offline" ||
    Boolean(error && (error.includes("后端服务不可达") || error.includes("后端服务不可用") || error.includes("network unavailable")));

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
                <button
                  className="btn primary"
                  onClick={onShowCreateProject}
                  disabled={backendUnavailable}
                  title={backendUnavailable ? "后端服务未连接，暂不可创建项目" : undefined}
                >
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
              modelRelations={modelRelations}
              opsMetrics={opsMetrics}
              status={status}
              error={error}
              backendUnavailable={backendUnavailable}
              onShowCreateIteration={onShowCreateIteration}
              onEnterIteration={onEnterIteration}
              onDeleteProject={onDeleteProject}
            />
          </section>
        ) : (
          <section className={`workspace-grid iteration-standalone ${showAnalysisPanel ? "analysis-open" : ""}`}>
            <IterationWorkspacePanel
              currentIteration={currentIteration}
              contextData={contextData}
              stateMachine={stateMachine}
              chatMessages={chatMessages}
              chatInput={chatInput}
              fileInputRef={fileInputRef}
              uploadedFile={uploadedFile}
              error={error}
              analysisReport={analysisReport}
              showAnalysisPanel={showAnalysisPanel}
              isAnalyzingAttachment={isAnalyzingAttachment}
              uploadAnalysisProgress={uploadAnalysisProgress}
              onUploadClick={onUploadClick}
              onOpenAnalysisPanel={onOpenAnalysisPanel}
              onCloseAnalysisPanel={onCloseAnalysisPanel}
              onUpload={onUpload}
              onUploadFiles={onUploadFiles}
              onChatInputChange={onChatInputChange}
              onChatSend={onChatSend}
              onUpdateClarificationDraft={onUpdateClarificationDraft}
              onConfirmIterationAnalysis={onConfirmIterationAnalysis}
              onUpdateIterationBoundary={onUpdateIterationBoundary}
              onUpdateTestMatrixExecution={onUpdateTestMatrixExecution}
              onGenerateTestArtifacts={onGenerateTestArtifacts}
              onRefreshReleaseReview={onRefreshReleaseReview}
              onTransitionState={onTransitionState}
              onSwitchToProjectPanel={onSwitchToProjectPanel}
              onPatchUploadedHtmlPreview={onPatchUploadedHtmlPreview}
            />
          </section>
        )
      )}
    </section>
  );
}
