import { useCallback, useEffect } from "react";
import {
  accessShare,
  commentByShare,
  createDeployment,
  createModelRelation,
  createProjectShare,
  createVersionSnapshot,
  deleteModelRelation,
  restoreVersionSnapshot,
  runTemplate,
  transitionDeployment
} from "./workspaceApi";
import { useAuthController } from "./useAuthController";
import { useDismissibleMenu } from "./useDismissibleMenu";
import { useIterationActions } from "./useIterationActions";
import { useProjectActions } from "./useProjectActions";
import { useWorkspaceDerived } from "./useWorkspaceDerived";
import { useWorkspaceLoaders } from "./useWorkspaceLoaders";
import { useWorkspaceState } from "./useWorkspaceState";

export function useAppController() {
  const auth = useAuthController();
  const state = useWorkspaceState();
  const closeUserMenu = useCallback(() => state.setShowUserMenu(false), [state.setShowUserMenu]);

  const dockUserLabel = "登录用户";
  const dockUserAvatar =
    localStorage.getItem("buildwise:userAvatar") ?? "https://randomuser.me/api/portraits/men/32.jpg";

  const derived = useWorkspaceDerived({
    projects: state.projects,
    currentProjectId: state.currentProjectId,
    iterations: state.iterations,
    currentIterationId: state.currentIterationId
  });

  useDismissibleMenu({ open: state.showUserMenu, menuRef: state.userMenuRef, onClose: closeUserMenu });

  const loaders = useWorkspaceLoaders({
    currentProjectId: state.currentProjectId,
    setStatus: state.setStatus,
    setError: state.setError,
    setProjects: state.setProjects,
    setCurrentProjectId: state.setCurrentProjectId,
    setIterations: state.setIterations,
    setCurrentIterationId: state.setCurrentIterationId,
    setChatMessages: state.setChatMessages,
    setContextData: state.setContextData,
    setAssessmentData: state.setAssessmentData,
    setAssessmentHistory: state.setAssessmentHistory,
    setStateMachine: state.setStateMachine,
    setModelSummary: state.setModelSummary,
    setModelRelations: state.setModelRelations,
    setRuleCompile: state.setRuleCompile,
    setRuleBind: state.setRuleBind,
    setSyncReport: state.setSyncReport,
    setTraceReport: state.setTraceReport,
    setRoadmapReports: state.setRoadmapReports,
    setModelOpsLoading: state.setModelOpsLoading,
    setGovernanceRoles: state.setGovernanceRoles,
    setAuditLogs: state.setAuditLogs,
    setVersionSnapshots: state.setVersionSnapshots,
    setProjectShares: state.setProjectShares,
    setTemplates: state.setTemplates,
    setTemplateRuns: state.setTemplateRuns,
    setOpsMetrics: state.setOpsMetrics,
    setDeployments: state.setDeployments
  });

  useEffect(() => {
    if (!state.currentProjectId) {
      state.setIterations([]);
      state.setCurrentIterationId(null);
      state.setProjectPanelMode("project");
      state.setVersionSnapshots([]);
      state.setProjectShares([]);
      state.setShareAccess(null);
      return;
    }
    Promise.all([loaders.loadIterations(state.currentProjectId), loaders.loadCollaboration(state.currentProjectId)]).catch((err) => {
      state.setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [state.currentProjectId]);

  useEffect(() => {
    if (!state.currentIterationId) {
      state.setChatMessages([]);
      state.setContextData(null);
      state.setAssessmentData(null);
      state.setAssessmentHistory([]);
      state.setStateMachine(null);
      state.setAnalysisReport(null);
      state.setShowAnalysisPanel(false);
      state.setIsAnalyzingAttachment(false);
      return;
    }
    loaders.loadIterationDetail(state.currentIterationId).catch((err) => {
      state.setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [state.currentIterationId]);

  const projectActions = useProjectActions({
    currentProject: derived.currentProject,
    projectName: state.projectName,
    projectDesc: state.projectDesc,
    iterName: state.iterName,
    iterDesc: state.iterDesc,
    iterGoals: state.iterGoals,
    iterInScope: state.iterInScope,
    iterOutScope: state.iterOutScope,
    iterAcceptance: state.iterAcceptance,
    setBusy: state.setBusy,
    setError: state.setError,
    setCurrentProjectId: state.setCurrentProjectId,
    setCurrentIterationId: state.setCurrentIterationId,
    setProjectPanelMode: state.setProjectPanelMode,
    setShowCreateProject: state.setShowCreateProject,
    setShowCreateIteration: state.setShowCreateIteration,
    setUploadedFile: state.setUploadedFile,
    setProjectName: state.setProjectName,
    setProjectDesc: state.setProjectDesc,
    setIterName: state.setIterName,
    setIterDesc: state.setIterDesc,
    setIterGoals: state.setIterGoals,
    setIterInScope: state.setIterInScope,
    setIterOutScope: state.setIterOutScope,
    setIterAcceptance: state.setIterAcceptance,
    loadProjects: loaders.loadProjects,
    loadIterations: loaders.loadIterations
  });

  const iterationActions = useIterationActions({
    currentIteration: derived.currentIteration,
    currentProjectId: state.currentProjectId,
    contextData: state.contextData,
    chatInput: state.chatInput,
    fileInputRef: state.fileInputRef,
    setChatInput: state.setChatInput,
    setBusy: state.setBusy,
    setError: state.setError,
    setUploadedFile: state.setUploadedFile,
    setChatMessages: state.setChatMessages,
    setStateMachine: state.setStateMachine,
    setAnalysisReport: state.setAnalysisReport,
    setShowAnalysisPanel: state.setShowAnalysisPanel,
    setIsAnalyzingAttachment: state.setIsAnalyzingAttachment,
    loadIterationDetail: loaders.loadIterationDetail,
    loadIterations: loaders.loadIterations,
    loadGovernance: loaders.loadGovernance
  });

  const handleLogout = () => {
    state.setShowUserMenu(false);
    auth.logout();
  };

  const handleCreateModelRelation = async (payload: {
    fromEntityId: string;
    toEntityId: string;
    type: "one_to_one" | "one_to_many" | "many_to_many";
    name?: string;
  }) => {
    try {
      state.setModelOpsLoading(true);
      await createModelRelation(payload);
      await Promise.all([loaders.loadModelOps(), loaders.loadGovernance()]);
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  const handleDeleteModelRelation = async (relationId: string) => {
    try {
      state.setModelOpsLoading(true);
      await deleteModelRelation(relationId);
      await Promise.all([loaders.loadModelOps(), loaders.loadGovernance()]);
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  const handleRefreshModelOps = async () => {
    await Promise.all([
      loaders.loadModelOps(),
      loaders.loadGovernance(),
      state.currentProjectId ? loaders.loadCollaboration(state.currentProjectId) : Promise.resolve()
    ]);
  };

  const handleCreateVersionSnapshot = async () => {
    if (!state.currentProjectId || !derived.currentIteration) {
      return;
    }
    await createVersionSnapshot({
      projectId: state.currentProjectId,
      iterationId: derived.currentIteration.id,
      name: `snapshot-${new Date().toISOString().slice(11, 19)}`,
      note: "dashboard quick snapshot"
    }, state.currentRole);
    await Promise.all([loaders.loadCollaboration(state.currentProjectId), loaders.loadGovernance()]);
  };

  const handleRestoreVersionSnapshot = async (snapshotId: number) => {
    await restoreVersionSnapshot(snapshotId, state.currentRole);
    await Promise.all([
      state.currentProjectId ? loaders.loadCollaboration(state.currentProjectId) : Promise.resolve(),
      derived.currentIteration ? loaders.loadIterationDetail(derived.currentIteration.id) : Promise.resolve(),
      state.currentProjectId ? loaders.loadIterations(state.currentProjectId) : Promise.resolve(),
      loaders.loadGovernance()
    ]);
  };

  const handleCreateProjectShare = async () => {
    if (!state.currentProjectId) {
      return;
    }
    await createProjectShare({ projectId: state.currentProjectId, permission: "comment", ttlHours: 72 }, state.currentRole);
    await Promise.all([loaders.loadCollaboration(state.currentProjectId), loaders.loadGovernance()]);
  };

  const handleRunTemplate = async (templateId: string, parameters: Record<string, string>) => {
    if (!state.currentProjectId) {
      return;
    }
    const result = await runTemplate(templateId, state.currentProjectId, parameters, state.currentRole);
    state.setLatestTemplateRun(result);
    await Promise.all([loaders.loadGovernance(), loaders.loadModelOps()]);
  };

  const handleCreateDeployment = async (environment: "staging" | "production") => {
    if (!state.currentProjectId) {
      return;
    }
    const version = `v${Date.now().toString().slice(-6)}`;
    await createDeployment({ projectId: state.currentProjectId, environment, version }, state.currentRole);
    await Promise.all([loaders.loadModelOps(), loaders.loadGovernance()]);
  };

  const handleTransitionDeployment = async (deploymentId: number, toStatus: "running" | "success" | "failed") => {
    await transitionDeployment(deploymentId, toStatus, state.currentRole);
    await Promise.all([loaders.loadModelOps(), loaders.loadGovernance()]);
  };

  const handleAccessShare = async (token: string) => {
    const data = await accessShare(token);
    state.setShareAccess(data);
  };

  const handleCommentShare = async (token: string, content: string) => {
    await commentByShare(token, content);
    await loaders.loadGovernance();
  };

  return {
    ...auth,
    ...state,
    ...derived,
    dockUserLabel,
    dockUserAvatar,
    handleLogout,
    loadModelOps: handleRefreshModelOps,
    handleCreateModelRelation,
    handleDeleteModelRelation,
    handleCreateVersionSnapshot,
    handleRestoreVersionSnapshot,
    handleCreateProjectShare,
    handleRunTemplate,
    handleCreateDeployment,
    handleTransitionDeployment,
    handleAccessShare,
    handleCommentShare,
    ...projectActions,
    ...iterationActions
  };
}
