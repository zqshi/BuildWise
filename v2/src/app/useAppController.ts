import { useCallback, useEffect } from "react";
import type { AttachmentAnalysisReport, UploadedAttachmentMeta } from "../domain/workspace/types";
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
  const analysisReportCacheKey = (iterationId: number) => `buildwise:analysis-report:${iterationId}`;
  const uploadedAttachmentCacheKey = (iterationId: number) => `buildwise:uploaded-attachment:${iterationId}`;
  const auth = useAuthController();
  const state = useWorkspaceState();
  const closeUserMenu = useCallback(() => state.setShowUserMenu(false), [state.setShowUserMenu]);
  const defaultDockAvatar =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%232563eb'/%3E%3Cstop offset='100%25' stop-color='%230ea5e9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='16' fill='url(%23g)'/%3E%3Ctext x='40' y='49' text-anchor='middle' font-size='28' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-weight='700' fill='white'%3EBW%3C/text%3E%3C/svg%3E";

  const dockUserLabel = "登录用户";
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
    try {
      localStorage.setItem("buildwise:active-view", state.activeView);
    } catch {
      // ignore storage failure
    }
  }, [state.activeView]);

  useEffect(() => {
    try {
      localStorage.setItem("buildwise:project-panel-mode", state.projectPanelMode);
    } catch {
      // ignore storage failure
    }
  }, [state.projectPanelMode]);

  useEffect(() => {
    try {
      if (state.currentProjectId) {
        localStorage.setItem("buildwise:current-project-id", String(state.currentProjectId));
      }
    } catch {
      // ignore storage failure
    }
  }, [state.currentProjectId]);

  useEffect(() => {
    try {
      if (state.currentIterationId) {
        localStorage.setItem("buildwise:current-iteration-id", String(state.currentIterationId));
      }
    } catch {
      // ignore storage failure
    }
  }, [state.currentIterationId]);

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
    Promise.all([
      loaders.loadIterations(state.currentProjectId),
      loaders.loadCollaboration(state.currentProjectId),
      loaders.loadModelOps(state.currentProjectId)
    ]).catch((err) => {
      state.setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [state.currentProjectId]);

  useEffect(() => {
    if (!state.currentIterationId) {
      state.setChatMessages([]);
      state.setUploadedFile(null);
      state.setContextData(null);
      state.setAssessmentData(null);
      state.setAssessmentHistory([]);
      state.setStateMachine(null);
      state.setAnalysisReport(null);
      state.setShowAnalysisPanel(false);
      state.setIsAnalyzingAttachment(false);
      return;
    }
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
    loaders.loadIterationDetail(state.currentIterationId).catch((err) => {
      state.setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [state.currentIterationId]);

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
    if (state.modelOpsLoading || (state.modelSummary && state.ruleCompile && state.traceReport)) {
      return;
    }
    loaders.loadModelOps(state.currentProjectId ?? undefined).catch((err) => {
      state.setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [state.activeView, state.currentProjectId, state.modelOpsLoading, state.modelSummary, state.ruleCompile, state.traceReport]);

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
    if (!state.currentProjectId) {
      state.setError("请先选择项目，再进行关系建模。");
      return;
    }
    try {
      state.setModelOpsLoading(true);
      await createModelRelation({ ...payload, projectId: state.currentProjectId });
      await Promise.all([loaders.loadModelOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  const handleDeleteModelRelation = async (relationId: string) => {
    if (!state.currentProjectId) {
      state.setError("请先选择项目，再进行关系建模。");
      return;
    }
    try {
      state.setModelOpsLoading(true);
      await deleteModelRelation(relationId, state.currentProjectId);
      await Promise.all([loaders.loadModelOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
    } finally {
      state.setModelOpsLoading(false);
    }
  };

  const handleRefreshModelOps = async () => {
    await Promise.all([
      loaders.loadModelOps(state.currentProjectId ?? undefined),
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
    await Promise.all([loaders.loadGovernance(), loaders.loadModelOps(state.currentProjectId ?? undefined)]);
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
    await Promise.all([loaders.loadModelOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
  };

  const handleTransitionDeployment = async (deploymentId: number, toStatus: "running" | "success" | "failed") => {
    await transitionDeployment(deploymentId, toStatus, state.currentRole);
    await Promise.all([loaders.loadModelOps(state.currentProjectId ?? undefined), loaders.loadGovernance()]);
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
