/**
 * ProjectsWorkspaceConnector — 将 AppController 状态映射到 ProjectsWorkspace 的 props。
 *
 * 职责：隔离 ProjectsWorkspace 的巨量 prop 传递，保持上层组件精简。
 */
import type { AppControllerValue } from "../contexts/AppControllerContext";
import { ProjectsWorkspace } from "../pages/projects/ProjectsWorkspace";

type ConnectorProps = {
  controller: AppControllerValue;
  showAnalysisPanel: boolean;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
};

export function ProjectsWorkspaceConnector({
  controller,
  showAnalysisPanel,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
}: ConnectorProps) {
  const callbacks = buildCallbacks(controller, onOpenAnalysisPanel, onCloseAnalysisPanel);
  return (
    <ProjectsWorkspace
      {...buildStateProps(controller)}
      showAnalysisPanel={showAnalysisPanel}
      {...callbacks}
    />
  );
}

function buildStateProps(c: AppControllerValue) {
  return {
    projects: c.projects,
    projectsHydrated: c.projectsHydrated,
    currentProjectId: c.currentProjectId,
    currentRole: c.currentRole,
    currentProject: c.currentProject,
    currentIteration: c.currentIteration,
    iterations: c.iterations,
    projectPanelMode: c.projectPanelMode,
    projectProgress: c.projectProgress,
    versionSnapshots: c.versionSnapshots,
    templateRuns: c.templateRuns,
    deployments: c.deployments,
    opsMetrics: c.opsMetrics,
    status: c.status,
    error: c.error,
    uploadedFile: c.uploadedFile,
    contextData: c.contextData,
    stateMachine: c.stateMachine,
    chatMessages: c.chatMessages,
    chatSendStatus: c.chatSendStatus,
    fullCycleJob: c.fullCycleJob,
    chatInput: c.chatInput,
    fileInputRef: c.fileInputRef,
    analysisReport: c.analysisReport,
    isAnalyzingAttachment: c.isAnalyzingAttachment,
    lastUploadFailed: c.lastUploadFailed,
    uploadAnalysisProgress: c.uploadAnalysisProgress,
    uploadToastMessage: c.uploadToastMessage,
  };
}

function buildCallbacks(
  c: AppControllerValue,
  onOpenAnalysisPanel: () => void,
  onCloseAnalysisPanel: () => void,
) {
  return {
    onShowCreateProject: () => { c.setError(null); c.setShowCreateProject(true); },
    onShowCreateIteration: () => { c.setError(null); c.setShowCreateIteration(true); },
    onDeleteProject: c.handleDeleteProject,
    onDeleteIteration: c.handleDeleteIteration,
    onUploadClick: c.handleUploadClick,
    onOpenAnalysisPanel,
    onCloseAnalysisPanel,
    onClearUploadToast: () => c.setUploadToastMessage(null),
    onSelectProject: c.handleSelectProject,
    onEnterIteration: c.handleEnterIteration,
    onSwitchToProjectPanel: () => {
      c.setShowAnalysisPanel(false);
      c.setProjectPanelMode("project");
    },
    onUpload: c.handleUpload,
    onUploadFiles: c.uploadFiles,
    onRetryUpload: c.handleRetryUpload,
    onChatInputChange: c.setChatInput,
    onChatSend: c.handleSend,
    onCancelFullCycle: c.onCancelFullCycle,
    onRetryFullCycle: c.onRetryFullCycle,
    onUpdateClarificationDraft: c.handleUpdateClarificationDraft,
    onConfirmIterationAnalysis: c.handleConfirmIterationAnalysis,
    onUpdateIterationBoundary: c.handleUpdateIterationBoundary,
    onUpdateTestMatrixExecution: c.handleUpdateTestMatrixExecution,
    onGenerateTestArtifacts: c.handleGenerateTestArtifacts,
    onRefreshReleaseReview: c.handleRefreshReleaseReview,
    onSaveArtifactDraft: c.handleSaveArtifactDraft,
    onCommitArtifact: c.handleCommitArtifact,
    onConfirmArtifact: c.handleConfirmArtifact,
    onAppendArtifactToChat: c.handleAppendArtifactToChat,
    onTransitionArtifactStage: c.handleTransitionArtifactStage,
    onTransitionState: c.handleTransitionState,
    onPatchUploadedHtmlPreview: buildHtmlPreviewPatcher(c),
  };
}

function buildHtmlPreviewPatcher(controller: AppControllerValue) {
  return (path: string, content: string) => {
    controller.setUploadedFile((prev) => {
      if (!prev) return prev;
      const nextPreviews = prev.htmlPreviews.map((item) =>
        item.path === path ? { ...item, content } : item
      );
      return { ...prev, htmlPreviews: nextPreviews };
    });
  };
}
