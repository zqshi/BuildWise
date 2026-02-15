import { useCallback, useEffect } from "react";
import { createModelRelation, deleteModelRelation } from "./workspaceApi";
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
    setModelOpsLoading: state.setModelOpsLoading
  });

  useEffect(() => {
    if (!state.currentProjectId) {
      state.setIterations([]);
      state.setCurrentIterationId(null);
      state.setProjectPanelMode("project");
      return;
    }
    loaders.loadIterations(state.currentProjectId).catch((err) => {
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
    loadIterations: loaders.loadIterations
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
      await loaders.loadModelOps();
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  const handleDeleteModelRelation = async (relationId: string) => {
    try {
      state.setModelOpsLoading(true);
      await deleteModelRelation(relationId);
      await loaders.loadModelOps();
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  return {
    ...auth,
    ...state,
    ...derived,
    dockUserLabel,
    dockUserAvatar,
    handleLogout,
    loadModelOps: loaders.loadModelOps,
    handleCreateModelRelation,
    handleDeleteModelRelation,
    ...projectActions,
    ...iterationActions
  };
}
