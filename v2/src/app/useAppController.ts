import { useCallback } from "react";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { useAuthController } from "./useAuthController";
import { useDismissibleMenu } from "./useDismissibleMenu";
import { useIterationActions } from "./useIterationActions";
import { useIterationLifecycle } from "./useIterationLifecycle";
import { useIterationRecovery } from "./useIterationRecovery";
import { useProjectActions } from "./useProjectActions";
import { useProjectLifecycle } from "./useProjectLifecycle";
import { useSessionSync } from "./useSessionSync";
import { useWorkspaceDerived } from "./useWorkspaceDerived";
import { useWorkspaceLoaders } from "./useWorkspaceLoaders";
import { useWorkspaceState } from "./useWorkspaceState";

export function useAppController() {
  const auth = useAuthController();
  const state = useWorkspaceState();
  const derived = useWorkspaceDerived({
    projects: state.projects,
    currentProjectId: state.currentProjectId,
    iterations: state.iterations,
    currentIterationId: state.currentIterationId,
  });

  const { dockUserLabel, dockUserAvatar } = useDockIdentity(auth);
  const currentTenant = auth.tenants.find((t) => t.tenantId === auth.currentTenantId) || null;

  const closeUserMenu = useCallback(() => state.setShowUserMenu(false), [state.setShowUserMenu]);
  useDismissibleMenu({ open: state.showUserMenu, menuRef: state.userMenuRef, onClose: closeUserMenu });

  const loaders = useWorkspaceLoaders(buildLoaderParams(state));
  const loadProjectsWithSessionRecovery = useLoadWithSessionRecovery(auth, loaders);

  useSessionSync({ auth, state, derived, loadProjectsWithSessionRecovery });
  useProjectLifecycle({
    isAuthenticated: auth.isAuthenticated,
    currentTenantId: auth.currentTenantId,
    state, loaders, derived, loadProjectsWithSessionRecovery,
  });
  useIterationLifecycle({ state, loaders, derived });
  useIterationRecovery({ currentIterationId: state.currentIterationId });

  const projectActions = useProjectActions(buildProjectActionParams(state, derived, loaders));
  const iterationActions = useIterationActions(buildIterationActionParams(state, derived, loaders));

  const handleLogout = () => { state.setShowUserMenu(false); auth.logout(); };
  const handleRefreshPlatformOps = async () => {
    await Promise.all([
      loaders.loadPlatformOps(state.currentProjectId ?? undefined),
      loaders.loadGovernance(),
      state.currentProjectId ? loaders.loadCollaboration(state.currentProjectId) : Promise.resolve(),
    ]);
  };

  return {
    ...auth, ...state, ...derived,
    dockUserLabel, dockUserAvatar, currentTenant,
    handleLogout,
    switchTenant: auth.switchTenant,
    loadPlatformOps: handleRefreshPlatformOps,
    ...projectActions, ...iterationActions,
  };
}

/* ── Dock 头像 / 标签 ── */

const DEFAULT_DOCK_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%232563eb'/%3E%3Cstop offset='100%25' stop-color='%230ea5e9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='16' fill='url(%23g)'/%3E%3Ctext x='40' y='49' text-anchor='middle' font-size='28' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-weight='700' fill='white'%3EBW%3C/text%3E%3C/svg%3E";

function useDockIdentity(auth: ReturnType<typeof useAuthController>) {
  const tenant = auth.tenants.find((t) => t.tenantId === auth.currentTenantId) || null;
  const dockUserLabel = tenant ? `${tenant.label} · 登录用户` : "登录用户";
  const dockUserAvatar = localStorage.getItem("buildwise:userAvatar") ?? DEFAULT_DOCK_AVATAR;
  return { dockUserLabel, dockUserAvatar };
}

/* ── 带会话恢复的项目加载 ── */

function useLoadWithSessionRecovery(
  auth: ReturnType<typeof useAuthController>,
  loaders: ReturnType<typeof useWorkspaceLoaders>,
) {
  return useCallback(async () => {
    try {
      return await loaders.loadProjects();
    } catch (err) {
      const message = resolveErrorMessage(err);
      if (!auth.isAuthenticated || !/API error: 403\b|permission denied/i.test(message)) throw err;
      const recovered = await auth.refreshSession();
      if (!recovered) throw err;
      return await loaders.loadProjects();
    }
  }, [auth.isAuthenticated, auth.refreshSession, loaders.loadProjects]);
}

/* ── 参数构建（避免主函数臃肿） ── */

function buildLoaderParams(state: ReturnType<typeof useWorkspaceState>) {
  return {
    currentProjectId: state.currentProjectId,
    setStatus: state.setStatus,
    setError: state.setError,
    setProjects: state.setProjects,
    setProjectsHydrated: state.setProjectsHydrated,
    setCurrentProjectId: state.setCurrentProjectId,
    setIterations: state.setIterations,
    setCurrentIterationId: state.setCurrentIterationId,
    setChatMessages: state.setChatMessages,
    setContextData: state.setContextData,
    setAssessmentData: state.setAssessmentData,
    setAssessmentHistory: state.setAssessmentHistory,
    setStateMachine: state.setStateMachine,
    setGovernanceRoles: state.setGovernanceRoles,
    setAuditLogs: state.setAuditLogs,
    setVersionSnapshots: state.setVersionSnapshots,
    setProjectShares: state.setProjectShares,
    setTemplates: state.setTemplates,
    setTemplateRuns: state.setTemplateRuns,
    setOpsMetrics: state.setOpsMetrics,
    setDeployments: state.setDeployments,
  };
}

function buildProjectActionParams(
  state: ReturnType<typeof useWorkspaceState>,
  derived: ReturnType<typeof useWorkspaceDerived>,
  loaders: ReturnType<typeof useWorkspaceLoaders>,
) {
  return {
    currentProject: derived.currentProject,
    projectName: state.projectName, projectDesc: state.projectDesc,
    targetPlatforms: state.targetPlatforms, setTargetPlatforms: state.setTargetPlatforms,
    iterName: state.iterName, iterDesc: state.iterDesc,
    iterGoals: state.iterGoals, iterInScope: state.iterInScope,
    iterOutScope: state.iterOutScope, iterAcceptance: state.iterAcceptance,
    iterVersionType: state.iterVersionType,
    setBusy: state.setBusy, setError: state.setError,
    setCurrentProjectId: state.setCurrentProjectId,
    setCurrentIterationId: state.setCurrentIterationId,
    setProjectPanelMode: state.setProjectPanelMode,
    setShowCreateProject: state.setShowCreateProject,
    setShowCreateIteration: state.setShowCreateIteration,
    setUploadedFile: state.setUploadedFile,
    setProjectName: state.setProjectName, setProjectDesc: state.setProjectDesc,
    setIterName: state.setIterName, setIterDesc: state.setIterDesc,
    setIterGoals: state.setIterGoals, setIterInScope: state.setIterInScope,
    setIterOutScope: state.setIterOutScope, setIterAcceptance: state.setIterAcceptance,
    setIterVersionType: state.setIterVersionType,
    loadProjects: loaders.loadProjects,
    loadIterations: loaders.loadIterations,
  };
}

function buildIterationActionParams(
  state: ReturnType<typeof useWorkspaceState>,
  derived: ReturnType<typeof useWorkspaceDerived>,
  loaders: ReturnType<typeof useWorkspaceLoaders>,
) {
  return {
    currentIteration: derived.currentIteration,
    currentProjectId: state.currentProjectId,
    currentRole: state.currentRole,
    contextData: state.contextData, analysisReport: state.analysisReport,
    uploadedFile: state.uploadedFile, chatInput: state.chatInput,
    fileInputRef: state.fileInputRef,
    setChatInput: state.setChatInput, setChatSendStatus: state.setChatSendStatus,
    fullCycleJob: state.fullCycleJob, setFullCycleJob: state.setFullCycleJob,
    setBusy: state.setBusy, setError: state.setError,
    setUploadedFile: state.setUploadedFile,
    setChatMessages: state.setChatMessages,
    setStateMachine: state.setStateMachine,
    setAnalysisReport: state.setAnalysisReport,
    setShowAnalysisPanel: state.setShowAnalysisPanel,
    setIsAnalyzingAttachment: state.setIsAnalyzingAttachment,
    setUploadAnalysisProgress: state.setUploadAnalysisProgress,
    setUploadToastMessage: state.setUploadToastMessage,
    loadIterationDetail: loaders.loadIterationDetail,
    loadIterations: loaders.loadIterations,
    loadGovernance: loaders.loadGovernance,
  };
}
