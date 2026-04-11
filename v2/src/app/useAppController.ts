import { useCallback, useEffect, useRef } from "react";
import type { UploadedAttachmentMeta } from "../domain/workspace/types";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { useAuthController } from "./useAuthController";
import { useDismissibleMenu } from "./useDismissibleMenu";
import { useIterationActions } from "./useIterationActions";
import { useIterationRecovery, analysisReportCacheKey, uploadedAttachmentCacheKey } from "./useIterationRecovery";
import { useProjectActions } from "./useProjectActions";
import { useWorkspaceDerived } from "./useWorkspaceDerived";
import { useWorkspaceLoaders } from "./useWorkspaceLoaders";
import { useWorkspaceState } from "./useWorkspaceState";
import type { AttachmentAnalysisReport } from "../domain/workspace/types";

export function useAppController() {
  const auth = useAuthController();
  const state = useWorkspaceState();
  const closeUserMenu = useCallback(() => state.setShowUserMenu(false), [state.setShowUserMenu]);
  const defaultDockAvatar =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%232563eb'/%3E%3Cstop offset='100%25' stop-color='%230ea5e9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='16' fill='url(%23g)'/%3E%3Ctext x='40' y='49' text-anchor='middle' font-size='28' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-weight='700' fill='white'%3EBW%3C/text%3E%3C/svg%3E";

  const currentTenant = auth.tenants.find((item) => item.tenantId === auth.currentTenantId) || null;
  const dockUserLabel = currentTenant ? `${currentTenant.label} · 登录用户` : "登录用户";
  const dockUserAvatar = localStorage.getItem("buildwise:userAvatar") ?? defaultDockAvatar;

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
    setDeployments: state.setDeployments
  });

  const loadProjectsWithSessionRecovery = useCallback(async () => {
    try {
      return await loaders.loadProjects();
    } catch (err) {
      const message = resolveErrorMessage(err);
      if (!auth.isAuthenticated || !/API error: 403\b|permission denied/i.test(message)) {
        throw err;
      }
      const recovered = await auth.refreshSession();
      if (!recovered) throw err;
      return await loaders.loadProjects();
    }
  }, [auth.isAuthenticated, auth.refreshSession, loaders.loadProjects]);

  useEffect(() => {
    const projectScopedRole = derived.currentProject?.currentUserRole;
    state.setCurrentRole(projectScopedRole || auth.workspaceRole);
  }, [auth.workspaceRole, derived.currentProject?.currentUserRole, state.setCurrentRole]);

  const lastTenantRef = useRef<string | null>(null);

  /* ── Tenant switch → full reset ── */
  useEffect(() => {
    if (!auth.isAuthenticated) {
      lastTenantRef.current = null;
      return;
    }
    const tenantKey = auth.currentTenantId || "";
    // 避免初始加载时（从 null/undefined 变为空字符串）误触发重置
    if (lastTenantRef.current === null && !tenantKey) {
      lastTenantRef.current = tenantKey;
      return;
    }
    if (lastTenantRef.current === tenantKey) return;
    lastTenantRef.current = tenantKey;
    state.setProjects([]);
    state.setProjectsHydrated(false);
    state.setCurrentProjectId(null);
    state.setIterations([]);
    state.setCurrentIterationId(null);
    state.setProjectPanelMode("project");
    state.setVersionSnapshots([]);
    state.setProjectShares([]);
    state.setShareAccess(null);
    loadProjectsWithSessionRecovery().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [auth.isAuthenticated, auth.currentTenantId, loadProjectsWithSessionRecovery]);

  /* ── Empty project retry ── */
  const projectRetryTimerRef = useRef<number | null>(null);
  const projectLoadRetryCountRef = useRef(0);

  useEffect(() => {
    projectLoadRetryCountRef.current = 0;
    if (projectRetryTimerRef.current !== null) {
      window.clearTimeout(projectRetryTimerRef.current);
      projectRetryTimerRef.current = null;
    }
  }, [auth.isAuthenticated, auth.currentTenantId]);

  useEffect(() => {
    if (!auth.isAuthenticated || state.projects.length > 0 || !state.projectsHydrated) {
      if (projectRetryTimerRef.current !== null) {
        window.clearTimeout(projectRetryTimerRef.current);
        projectRetryTimerRef.current = null;
      }
      return;
    }
    if (state.status?.status === "offline" || projectLoadRetryCountRef.current >= 3) return;
    projectRetryTimerRef.current = window.setTimeout(() => {
      projectRetryTimerRef.current = null;
      projectLoadRetryCountRef.current += 1;
      loadProjectsWithSessionRecovery().catch((err) => {
        const msg = resolveErrorMessage(err);
        if (!msg.includes("401")) state.setError(msg);
      });
    }, 1200);
    return () => {
      if (projectRetryTimerRef.current !== null) {
        window.clearTimeout(projectRetryTimerRef.current);
        projectRetryTimerRef.current = null;
      }
    };
  }, [auth.isAuthenticated, auth.currentTenantId, loadProjectsWithSessionRecovery, state.projects.length, state.projectsHydrated, state.status?.status]);

  const platformOpsLoadedForRef = useRef<number | null>(null);
  const projectExistsInList = derived.currentProject !== null && derived.currentProject.id === state.currentProjectId;
  const prevProjectIdRef = useRef<number | null>(state.currentProjectId);

  /* ── Project switch → load iterations + collaboration + platformOps ── */
  useEffect(() => {
    const projectActuallyChanged = prevProjectIdRef.current !== state.currentProjectId;
    prevProjectIdRef.current = state.currentProjectId;

    if (!state.currentProjectId) {
      state.setIterations([]);
      state.setCurrentIterationId(null);
      // 仅在项目 ID 真正变化时才重置面板模式，避免刷新数据时意外跳转
      if (projectActuallyChanged) {
        state.setProjectPanelMode("project");
      }
      state.setVersionSnapshots([]);
      state.setProjectShares([]);
      state.setShareAccess(null);
      platformOpsLoadedForRef.current = null;
      return;
    }
    if (!projectExistsInList) {
      state.setIterations([]);
      state.setCurrentIterationId(null);
      state.setVersionSnapshots([]);
      state.setProjectShares([]);
      state.setShareAccess(null);
      state.setError((prev) => (prev && /^API error: 404\b/.test(prev) ? null : prev));
      return;
    }
    platformOpsLoadedForRef.current = state.currentProjectId;
    Promise.all([
      loaders.loadIterations(state.currentProjectId),
      loaders.loadCollaboration(state.currentProjectId),
      loaders.loadPlatformOps(state.currentProjectId)
    ]).catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [state.currentProjectId, projectExistsInList]);

  /* ── Iteration switch → load detail + restore caches ── */
  const iterationExistsInList = derived.currentIteration !== null && derived.currentIteration.id === state.currentIterationId;
  const prevIterIdRef = useRef(state.currentIterationId);

  useEffect(() => {
    const iterIdChanged = prevIterIdRef.current !== state.currentIterationId;
    prevIterIdRef.current = state.currentIterationId;

    if (!state.currentIterationId || !iterationExistsInList) {
      if (state.isAnalyzingAttachment) return;
      state.setChatMessages([]);
      state.setChatSendStatus("idle");
      state.setUploadedFile(null);
      state.setContextData(null);
      state.setAssessmentData(null);
      state.setAssessmentHistory([]);
      state.setStateMachine(null);
      state.setAnalysisReport(null);
      state.setShowAnalysisPanel(false);
      state.setIsAnalyzingAttachment(false);
      state.setUploadAnalysisProgress(null);
      state.setUploadToastMessage(null);
      return;
    }
    if (state.isAnalyzingAttachment) return;
    state.setChatSendStatus((prev) => {
      if (iterIdChanged) return "idle";
      if (prev === "processing-artifacts" || prev === "processing-full-cycle") return prev;
      return "idle";
    });
    state.setUploadAnalysisProgress(null);
    state.setUploadToastMessage(null);
    state.setUploadedFile(null);
    state.setAnalysisReport(null);
    state.setShowAnalysisPanel(false);
    state.setIsAnalyzingAttachment(false);
    try {
      const rawUpload = localStorage.getItem(uploadedAttachmentCacheKey(state.currentIterationId));
      if (rawUpload) {
        const parsed = JSON.parse(rawUpload) as UploadedAttachmentMeta;
        if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
          state.setUploadedFile(parsed);
        }
      }
    } catch (err) {
      console.debug("[AppController] failed to parse upload cache from localStorage", err);
    }
    try {
      const raw = localStorage.getItem(analysisReportCacheKey(state.currentIterationId));
      if (raw) {
        const parsed = JSON.parse(raw) as AttachmentAnalysisReport;
        if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
          state.setAnalysisReport(parsed);
        }
      }
    } catch (err) {
      console.debug("[AppController] failed to parse analysis report cache from localStorage", err);
    }
    loaders.loadIterationDetail(state.currentIterationId).catch(async (err) => {
      const message = resolveErrorMessage(err);
      if (message.includes("401")) return;
      if (/^API error: 404\b/.test(message)) {
        if (state.currentProjectId) {
          try { await loaders.loadIterations(state.currentProjectId); } catch { /* noop */ }
        }
        return;
      }
      state.setError(message);
    });
  }, [state.currentIterationId, state.currentProjectId, iterationExistsInList]);

  /* ── Projects view auto-load ── */
  useEffect(() => {
    if (state.activeView !== "projects") return;
    if (state.projects.length > 0 || state.status?.status === "offline") return;
    loadProjectsWithSessionRecovery().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [loadProjectsWithSessionRecovery, state.activeView, state.projects.length, state.status?.status]);

  useEffect(() => {
    if (state.activeView !== "projects") return;
    const pid = state.currentProjectId ?? -1;
    if (platformOpsLoadedForRef.current === pid) return;
    platformOpsLoadedForRef.current = pid;
    loaders.loadPlatformOps(state.currentProjectId ?? undefined).catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [state.activeView, state.currentProjectId]);

  /* ── Sub-hooks: project & iteration actions ── */
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
    iterVersionType: state.iterVersionType,
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
    setIterVersionType: state.setIterVersionType,
    loadProjects: loaders.loadProjects,
    loadIterations: loaders.loadIterations
  });

  const iterationActions = useIterationActions({
    currentIteration: derived.currentIteration,
    currentProjectId: state.currentProjectId,
    currentRole: state.currentRole,
    contextData: state.contextData,
    analysisReport: state.analysisReport,
    uploadedFile: state.uploadedFile,
    chatInput: state.chatInput,
    fileInputRef: state.fileInputRef,
    setChatInput: state.setChatInput,
    setChatSendStatus: state.setChatSendStatus,
    setBusy: state.setBusy,
    setError: state.setError,
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
    loadGovernance: loaders.loadGovernance
  });

  /* ── Extracted hooks ── */
  useIterationRecovery({
    currentIterationId: state.currentIterationId
  });

  const handleLogout = () => {
    state.setShowUserMenu(false);
    auth.logout();
  };

  const handleRefreshPlatformOps = async () => {
    await Promise.all([
      loaders.loadPlatformOps(state.currentProjectId ?? undefined),
      loaders.loadGovernance(),
      state.currentProjectId ? loaders.loadCollaboration(state.currentProjectId) : Promise.resolve()
    ]);
  };

  return {
    ...auth,
    ...state,
    ...derived,
    dockUserLabel,
    dockUserAvatar,
    currentTenant,
    handleLogout,
    switchTenant: auth.switchTenant,
    loadPlatformOps: handleRefreshPlatformOps,
    ...projectActions,
    ...iterationActions
  };
}
