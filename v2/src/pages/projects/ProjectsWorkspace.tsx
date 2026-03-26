import { useMemo, useState, type ChangeEvent, type RefObject } from "react";
import type { DeploymentRecord, OpsMetricsPayload, TemplateRunHistory, VersionSnapshot } from "../../domain/workspace/platformTypes";
import type {
  AttachmentAnalysisReport,
  ChatSendStatus,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationVisualEditResponse,
  IterationStateMachinePayload,
  IterationStatus,
  Project,
  StatusPayload
} from "../../domain/workspace/types";
import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { IterationArtifactStage } from "../../domain/workspace/iterationTypes";
import { IterationWorkspacePanel } from "./IterationWorkspacePanel";
import { ProjectsWorkspaceEmptyState } from "./ProjectsWorkspaceEmptyState";
import { ProjectOverviewPanel } from "./ProjectOverviewPanel";

type ProjectsWorkspaceProps = {
  projects: Project[];
  projectsHydrated: boolean;
  currentProjectId: number | null;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  currentProject: Project | null;
  currentIteration: Iteration | null;
  iterations: Iteration[];
  projectPanelMode: "project" | "iteration";
  projectProgress: number;
  modelPageCount?: number;
  modelRuleCount?: number;
  modelEntityCount?: number;
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
  lastUploadFailed: boolean;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  uploadToastMessage: string | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatSendStatus: ChatSendStatus;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onShowCreateProject: () => void;
  onShowCreateIteration: () => void;
  onDeleteProject: (projectId: number) => Promise<void>;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onClearUploadToast: () => void;
  onSelectProject: (projectId: number) => void;
  onEnterIteration: (iterationId: number) => void;
  onSwitchToProjectPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles: (files: File[]) => void;
  onRetryUpload: () => void | Promise<void>;
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
    decisionEvent?: "understanding-accurate" | "understanding-inaccurate";
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
  onGenerateTestArtifacts: () => Promise<void> | void;
  onRefreshReleaseReview: () => Promise<void> | void;
  onSaveArtifactDraft: (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => Promise<void> | void;
  onCommitArtifact: (artifactId: string, payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }) => Promise<void> | void;
  onConfirmArtifact: (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) => Promise<void> | void;
  onAppendArtifactToChat: (artifactId: string, payload?: { actor?: string; prompt?: string }) => Promise<void> | void;
  onTransitionArtifactStage: (payload: { toStage: IterationArtifactStage; actor?: string; note?: string }) => Promise<void> | void;
  onTransitionState: (toStatus: IterationStatus) => void;
  onCreateDeployment: (environment: "staging" | "production") => Promise<void>;
  onTransitionDeployment: (deploymentId: number, toStatus: "running" | "success" | "failed") => Promise<void>;
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void;
};

export function ProjectsWorkspace({
  projects,
  projectsHydrated,
  currentProjectId,
  currentRole,
  currentProject,
  currentIteration,
  iterations,
  projectPanelMode,
  projectProgress,
  modelPageCount = 0,
  modelRuleCount = 0,
  modelEntityCount = 0,
  modelRelations = [],
  versionSnapshots: _versionSnapshots = [],
  templateRuns: _templateRuns = [],
  deployments: _deployments = [],
  opsMetrics = null,
  status,
  error,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  lastUploadFailed,
  uploadAnalysisProgress,
  uploadToastMessage,
  contextData,
  stateMachine,
  chatMessages,
  chatSendStatus,
  chatInput,
  fileInputRef,
  onShowCreateProject,
  onShowCreateIteration,
  onDeleteProject,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onClearUploadToast,
  onSelectProject,
  onEnterIteration,
  onSwitchToProjectPanel,
  onUpload,
  onUploadFiles,
  onRetryUpload,
  onChatInputChange,
  onChatSend,
  onUpdateClarificationDraft,
  onConfirmIterationAnalysis,
  onUpdateIterationBoundary,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
  onSaveArtifactDraft,
  onCommitArtifact,
  onConfirmArtifact,
  onAppendArtifactToChat,
  onTransitionArtifactStage,
  onTransitionState,
  onCreateDeployment: _onCreateDeployment,
  onTransitionDeployment: _onTransitionDeployment,
  onPatchUploadedHtmlPreview
}: ProjectsWorkspaceProps) {
  const hasProjects = projects.length > 0;
  const [projectSearch, setProjectSearch] = useState("");
  const showWorkspaceHero = false;
  const showProjectsLoading = !projectsHydrated && !hasProjects;
  const filteredProjects = useMemo(() => {
    const keyword = projectSearch.trim().toLowerCase();
    if (!keyword) {
      return projects;
    }
    return projects.filter((item) => `${item.name} ${item.description || ""}`.toLowerCase().includes(keyword));
  }, [projects, projectSearch]);
  const backendUnavailable =
    status?.status === "offline" ||
    Boolean(error && (error.includes("后端服务不可达") || error.includes("后端服务不可用") || error.includes("network unavailable")));
  const showProjectLoadError = !hasProjects && projectsHydrated && Boolean(error) && !backendUnavailable;
  return (
    <section className="projects-view">
      {showWorkspaceHero ? (
        <header className="hero-panel">
          <div>
            <p className="hero-kicker">项目工作台</p>
            <h1>{currentProject?.name || "项目管理"}</h1>
            <p className="hero-sub">
              {currentProject ? `${currentProject.description || "暂无描述"}` : "请选择项目后开始迭代"}
            </p>
          </div>
        </header>
      ) : null}
      {showProjectsLoading ? (
        <ProjectsWorkspaceEmptyState mode="loading" onShowCreateProject={onShowCreateProject} />
      ) : showProjectLoadError ? (
        <ProjectsWorkspaceEmptyState mode="error" error={error} onShowCreateProject={onShowCreateProject} />
      ) : !hasProjects ? (
        <ProjectsWorkspaceEmptyState
          mode="empty"
          backendUnavailable={backendUnavailable}
          onShowCreateProject={onShowCreateProject}
        />
      ) : (
        projectPanelMode === "project" ? (
          <section className="workspace-grid project-mode">
            <article className="panel project-panel">
              <div className="panel-head">
                <h2>项目列表</h2>
              </div>
              <label className="project-search-field" aria-label="搜索项目">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="搜索项目..."
                />
              </label>
              <ul className="project-list">
                {filteredProjects.map((item) => (
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
                {filteredProjects.length === 0 ? (
                  <li>
                    <div className="empty-state">没有匹配到项目，请调整搜索关键词。</div>
                  </li>
                ) : null}
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
              currentRole={currentRole}
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
              chatSendStatus={chatSendStatus}
              chatInput={chatInput}
              fileInputRef={fileInputRef}
              uploadedFile={uploadedFile}
              error={error}
              analysisReport={analysisReport}
              showAnalysisPanel={showAnalysisPanel}
              isAnalyzingAttachment={isAnalyzingAttachment}
              lastUploadFailed={lastUploadFailed}
              uploadAnalysisProgress={uploadAnalysisProgress}
              uploadToastMessage={uploadToastMessage}
              onUploadClick={onUploadClick}
              onOpenAnalysisPanel={onOpenAnalysisPanel}
              onCloseAnalysisPanel={onCloseAnalysisPanel}
              onClearUploadToast={onClearUploadToast}
              onUpload={onUpload}
              onUploadFiles={onUploadFiles}
              onRetryUpload={onRetryUpload}
              onChatInputChange={onChatInputChange}
              onChatSend={onChatSend}
              onUpdateClarificationDraft={onUpdateClarificationDraft}
              onConfirmIterationAnalysis={onConfirmIterationAnalysis}
              onUpdateIterationBoundary={onUpdateIterationBoundary}
              onUpdateTestMatrixExecution={onUpdateTestMatrixExecution}
              onGenerateTestArtifacts={onGenerateTestArtifacts}
              onRefreshReleaseReview={onRefreshReleaseReview}
              onSaveArtifactDraft={onSaveArtifactDraft}
              onCommitArtifact={onCommitArtifact}
              onConfirmArtifact={onConfirmArtifact}
              onAppendArtifactToChat={onAppendArtifactToChat}
              onTransitionArtifactStage={onTransitionArtifactStage}
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
