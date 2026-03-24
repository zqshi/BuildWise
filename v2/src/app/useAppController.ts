import { useCallback, useEffect, useRef } from "react";
import type { AttachmentAnalysisReport, UploadedAttachmentMeta } from "../domain/workspace/types";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import {
  accessShare,
  commentByShare,
  createDeployment,
  createProjectShare,
  createVersionSnapshot,
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
  const analysisReportCacheKey = (iterationId: number) => `buildwise:analysis-report:${iterationId}`;
  const uploadedAttachmentCacheKey = (iterationId: number) => `buildwise:uploaded-attachment:${iterationId}`;
  const auth = useAuthController();
  const state = useWorkspaceState();
  const closeUserMenu = useCallback(() => state.setShowUserMenu(false), [state.setShowUserMenu]);
  const defaultDockAvatar =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%232563eb'/%3E%3Cstop offset='100%25' stop-color='%230ea5e9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='16' fill='url(%23g)'/%3E%3Ctext x='40' y='49' text-anchor='middle' font-size='28' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-weight='700' fill='white'%3EBW%3C/text%3E%3C/svg%3E";

  const currentTenant = auth.tenants.find((item) => item.tenantId === auth.currentTenantId) || null;
  const dockUserLabel = currentTenant ? `${currentTenant.label} · 登录用户` : "登录用户";
  const dockUserAvatar =
    localStorage.getItem("buildwise:userAvatar") ?? defaultDockAvatar;

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
    setGovernanceRoles: state.setGovernanceRoles,
    setAuditLogs: state.setAuditLogs,
    setVersionSnapshots: state.setVersionSnapshots,
    setProjectShares: state.setProjectShares,
    setTemplates: state.setTemplates,
    setTemplateRuns: state.setTemplateRuns,
    setOpsMetrics: state.setOpsMetrics,
    setDeployments: state.setDeployments
  });

  // NOTE: localStorage persistence for activeView, projectPanelMode,
  // currentProjectId, and currentIterationId is now handled by the
  // corresponding Context providers (NavigationProvider, ProjectProvider,
  // IterationProvider).

  useEffect(() => {
    const projectScopedRole = derived.currentProject?.currentUserRole;
    state.setCurrentRole(projectScopedRole || auth.workspaceRole);
  }, [auth.workspaceRole, derived.currentProject?.currentUserRole, state.setCurrentRole]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      return;
    }
    state.setProjects([]);
    state.setCurrentProjectId(null);
    state.setIterations([]);
    state.setCurrentIterationId(null);
    state.setProjectPanelMode("project");
    state.setVersionSnapshots([]);
    state.setProjectShares([]);
    state.setShareAccess(null);
    loaders.loadProjects().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) {
        state.setError(msg);
      }
    });
  }, [auth.currentTenantId]);

  // Guard: only load platformOps once per project switch, not on every state change
  const platformOpsLoadedForRef = useRef<number | null>(null);

  // Track whether the current project actually exists in the loaded list
  const projectExistsInList = derived.currentProject !== null && derived.currentProject.id === state.currentProjectId;

  useEffect(() => {
    if (!state.currentProjectId) {
      state.setIterations([]);
      state.setCurrentIterationId(null);
      state.setProjectPanelMode("project");
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
      if (!msg.includes("401")) {
        state.setError(msg);
      }
    });
  }, [state.currentProjectId, projectExistsInList]);

  const iterationExistsInList = derived.currentIteration !== null && derived.currentIteration.id === state.currentIterationId;

  useEffect(() => {
    if (!state.currentIterationId || !iterationExistsInList) {
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
    state.setChatSendStatus("idle");
    state.setUploadAnalysisProgress(null);
    state.setUploadToastMessage(null);
    state.setUploadedFile(null);
    try {
      const rawUpload = localStorage.getItem(uploadedAttachmentCacheKey(state.currentIterationId));
      if (rawUpload) {
        const parsed = JSON.parse(rawUpload) as UploadedAttachmentMeta;
        if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
          state.setUploadedFile(parsed);
        }
      }
    } catch {
      // ignore broken cache and continue with backend data
    }
    try {
      const raw = localStorage.getItem(analysisReportCacheKey(state.currentIterationId));
      if (raw) {
        const parsed = JSON.parse(raw) as AttachmentAnalysisReport;
        if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
          state.setAnalysisReport(parsed);
        }
      }
    } catch {
      // ignore broken cache and continue with backend data
    }
    loaders.loadIterationDetail(state.currentIterationId).catch(async (err) => {
      const message = resolveErrorMessage(err);
      if (message.includes("401")) {
        return;
      }
      if (/^API error: 404\b/.test(message)) {
        if (state.currentProjectId) {
          try {
            await loaders.loadIterations(state.currentProjectId);
          } catch {
            // keep existing behavior: only surface the original fetch error if recovery fails
          }
        }
        return;
      }
      state.setError(message);
    });
  }, [state.currentIterationId, state.currentProjectId, iterationExistsInList]);

  useEffect(() => {
    if (!state.currentIterationId || !state.analysisReport) {
      return;
    }
    if (state.analysisReport.iterationId !== state.currentIterationId) {
      return;
    }
    try {
      localStorage.setItem(analysisReportCacheKey(state.currentIterationId), JSON.stringify(state.analysisReport));
    } catch {
      // ignore storage failure
    }
  }, [state.currentIterationId, state.analysisReport]);

  useEffect(() => {
    if (!state.currentIterationId || !state.uploadedFile) {
      return;
    }
    if (state.uploadedFile.iterationId !== state.currentIterationId) {
      return;
    }
    try {
      localStorage.setItem(uploadedAttachmentCacheKey(state.currentIterationId), JSON.stringify(state.uploadedFile));
    } catch {
      // ignore storage failure
    }
  }, [state.currentIterationId, state.uploadedFile]);

  useEffect(() => {
    if (state.activeView !== "projects") {
      return;
    }
    if (state.projects.length > 0 || state.status?.status === "offline") {
      return;
    }
    loaders.loadProjects().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) {
        state.setError(msg);
      }
    });
  }, [state.activeView, state.projects.length, state.status?.status]);

  // Guard: only load platformOps once per view switch (not re-triggered by state changes from loadPlatformOps itself)
  useEffect(() => {
    if (state.activeView !== "projects") {
      return;
    }
    const pid = state.currentProjectId ?? -1;
    if (platformOpsLoadedForRef.current === pid) {
      return;
    }
    platformOpsLoadedForRef.current = pid;
    loaders.loadPlatformOps(state.currentProjectId ?? undefined).catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) {
        state.setError(msg);
      }
    });
  }, [state.activeView, state.currentProjectId]);

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
    const fallbackIterationId =
      derived.currentIteration?.id ??
      state.iterations.find((item) => item.current)?.id ??
      state.iterations[state.iterations.length - 1]?.id;
    const payload: Record<string, string> = { ...parameters };
    if (fallbackIterationId && !payload.iterationId) {
      payload.iterationId = String(fallbackIterationId);
    }
    const result = await runTemplate(templateId, state.currentProjectId, payload, state.currentRole);
    state.setLatestTemplateRun(result);
    await Promise.all([loaders.loadGovernance(), loaders.loadPlatformOps(state.currentProjectId ?? undefined)]);
  };

  const resolveGovernanceGate = () => {
    const findMetric = (name: string) => state.opsMetrics?.metrics.find((item) => item.name === name)?.value ?? 0;
    const deploymentSuccessRate = Number(findMetric("deployment_success_rate"));
    const testMatrixExecutionCoverage = Number(findMetric("iteration_test_matrix_execution_coverage"));
    const testMatrixPassRate = Number(findMetric("iteration_test_matrix_pass_rate"));
    const highValueCoverage = Number(findMetric("iteration_high_value_findings_coverage"));
    const clarificationDebtTotal = state.iterations.reduce(
      (sum, item) => sum + (item.changeControl?.lastClarificationResolution?.unresolvedQuestions.length ?? 0),
      0
    );
    const p0FindingsTotal = Number(findMetric("iteration_p0_findings_total"));
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          deploymentSuccessRate * 0.25 +
            testMatrixExecutionCoverage * 0.25 +
            testMatrixPassRate * 0.2 +
            highValueCoverage * 0.2 +
            (100 - Math.min(clarificationDebtTotal * 8, 100)) * 0.1
        )
      )
    );
    const gate =
      score >= 85 && clarificationDebtTotal === 0 && p0FindingsTotal === 0
        ? "pass"
        : score >= 65
          ? "warning"
          : "block";
    return { score, gate, clarificationDebtTotal, p0FindingsTotal };
  };

  const handleCreateDeployment = async (environment: "staging" | "production") => {
    if (!state.currentProjectId) {
      return;
    }
    if (environment === "production") {
      const gate = resolveGovernanceGate();
      if (gate.gate === "block") {
        state.setError(
          `发布阻断：治理门禁=BLOCK（score=${gate.score}, clarificationDebt=${gate.clarificationDebtTotal}, p0=${gate.p0FindingsTotal}）。建议先处理：1) 清空澄清未解项 2) 清除 P0 风险 3) 确保测试执行覆盖与通过率达标。`
        );
        return;
      }
    }
    const fallbackIterationId =
      derived.currentIteration?.id ??
      state.iterations.find((item) => item.current)?.id ??
      state.iterations[state.iterations.length - 1]?.id;
    const version = fallbackIterationId ? `iter-v${fallbackIterationId}-${Date.now().toString().slice(-4)}` : `v${Date.now().toString().slice(-6)}`;
    await createDeployment(
      {
        projectId: state.currentProjectId,
        iterationId: fallbackIterationId,
        environment,
        version
      },
      state.currentRole
    );
    await Promise.all([loaders.loadPlatformOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
  };

  const handleTransitionDeployment = async (deploymentId: number, toStatus: "running" | "success" | "failed") => {
    await transitionDeployment(deploymentId, toStatus, state.currentRole);
    await Promise.all([loaders.loadPlatformOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
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
    currentTenant,
    handleLogout,
    switchTenant: auth.switchTenant,
    loadPlatformOps: handleRefreshPlatformOps,
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
