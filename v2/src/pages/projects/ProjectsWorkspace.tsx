import { useMemo, useState } from "react";
import type { DeploymentRecord, OpsMetricsPayload, TemplateRunHistory, VersionSnapshot } from "../../domain/workspace/platformTypes";
import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import { useAppControllerContext } from "../../contexts/AppControllerContext";
import { IterationWorkspacePanel } from "./IterationWorkspacePanel";
import { ProjectsWorkspaceEmptyState } from "./ProjectsWorkspaceEmptyState";
import { ProjectOverviewPanel } from "./ProjectOverviewPanel";

/**
 * ProjectsWorkspaceProps — 收窄到 controller 无法提供的少数可选展示字段。
 *
 * 其余状态/回调全部从 AppControllerContext 获取（见 useAppControllerContext）。
 * modelPageCount/modelRuleCount/modelEntityCount/modelRelations 来自本体元数据视图，
 * 当前上层未传入（使用默认值），保留可选以备后续接入。
 * onCreateDeployment/onTransitionDeployment 同理保留可选。
 */
type ProjectsWorkspaceProps = {
  modelPageCount?: number;
  modelRuleCount?: number;
  modelEntityCount?: number;
  modelRelations?: ModelRelationPayload[];
  versionSnapshots?: VersionSnapshot[];
  templateRuns?: TemplateRunHistory[];
  deployments?: DeploymentRecord[];
  opsMetrics?: OpsMetricsPayload | null;
  onCreateDeployment?: (environment: "staging" | "production") => Promise<void>;
  onTransitionDeployment?: (deploymentId: number, toStatus: "running" | "success" | "failed") => Promise<void>;
};

export function ProjectsWorkspace({
  modelPageCount = 0,
  modelRuleCount = 0,
  modelEntityCount = 0,
  modelRelations = [],
  versionSnapshots: _versionSnapshots = [],
  templateRuns: _templateRuns = [],
  deployments: _deployments = [],
  opsMetrics = null,
  onCreateDeployment: _onCreateDeployment,
  onTransitionDeployment: _onTransitionDeployment,
}: ProjectsWorkspaceProps) {
  const c = useAppControllerContext();

  const projects = c.projects;
  const projectsHydrated = c.projectsHydrated;
  const currentProjectId = c.currentProjectId;
  const currentRole = c.currentRole;
  const currentProject = c.currentProject;
  const currentIteration = c.currentIteration;
  const iterations = c.iterations;
  const projectPanelMode = c.projectPanelMode;
  const projectProgress = c.projectProgress;
  const status = c.status;
  const error = c.error;
  const uploadedFile = c.uploadedFile;
  const analysisReport = c.analysisReport;
  const showAnalysisPanel = c.showAnalysisPanel;
  const isAnalyzingAttachment = c.isAnalyzingAttachment;
  const lastUploadFailed = c.lastUploadFailed;
  const uploadAnalysisProgress = c.uploadAnalysisProgress;
  const uploadToastMessage = c.uploadToastMessage;
  const contextData = c.contextData;
  const stateMachine = c.stateMachine;
  const chatMessages = c.chatMessages;
  const chatSendStatus = c.chatSendStatus;
  const fullCycleJob = c.fullCycleJob;
  const chatInput = c.chatInput;
  const fileInputRef = c.fileInputRef;

  const onShowCreateProject = () => {
    c.setError(null);
    c.setShowCreateProject(true);
  };
  const onShowCreateIteration = () => {
    c.setError(null);
    c.setShowCreateIteration(true);
  };
  const onDeleteProject = c.handleDeleteProject;
  const onDeleteIteration = c.handleDeleteIteration;
  const onUploadClick = c.handleUploadClick;
  const onOpenAnalysisPanel = () => c.setShowAnalysisPanel(true);
  const onCloseAnalysisPanel = () => c.setShowAnalysisPanel(false);
  const onClearUploadToast = () => c.setUploadToastMessage(null);
  const onSelectProject = c.handleSelectProject;
  const onEnterIteration = c.handleEnterIteration;
  const onSwitchToProjectPanel = () => {
    c.setShowAnalysisPanel(false);
    c.setProjectPanelMode("project");
  };
  const onUpload = c.handleUpload;
  const onUploadFiles = c.uploadFiles;
  const onRetryUpload = c.handleRetryUpload;
  const onChatInputChange = c.setChatInput;
  const onChatSend = c.handleSend;
  const onCancelFullCycle = c.onCancelFullCycle;
  const onRetryFullCycle = c.onRetryFullCycle;
  const onUpdateClarificationDraft = c.handleUpdateClarificationDraft;
  const onConfirmIterationAnalysis = c.handleConfirmIterationAnalysis;
  const onUpdateIterationBoundary = c.handleUpdateIterationBoundary;
  const onUpdateTestMatrixExecution = c.handleUpdateTestMatrixExecution;
  const onGenerateTestArtifacts = c.handleGenerateTestArtifacts;
  const onRefreshReleaseReview = c.handleRefreshReleaseReview;
  const onSaveArtifactDraft = c.handleSaveArtifactDraft;
  const onCommitArtifact = c.handleCommitArtifact;
  const onConfirmArtifact = c.handleConfirmArtifact;
  const onAppendArtifactToChat = c.handleAppendArtifactToChat;
  const onTransitionArtifactStage = c.handleTransitionArtifactStage;
  const onTransitionState = c.handleTransitionState;
  const onPatchUploadedHtmlPreview = (path: string, content: string) => {
    c.setUploadedFile((prev) => {
      if (!prev) return prev;
      const nextPreviews = prev.htmlPreviews.map((item) =>
        item.path === path ? { ...item, content } : item
      );
      return { ...prev, htmlPreviews: nextPreviews };
    });
  };

  const hasProjects = projects.length > 0;
  const [projectSearch, setProjectSearch] = useState("");
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
              onDeleteIteration={onDeleteIteration}
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
              fullCycleJob={fullCycleJob}
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
              onCancelFullCycle={onCancelFullCycle}
              onRetryFullCycle={onRetryFullCycle}
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
