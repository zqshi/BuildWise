/**
 * Legacy facade: aggregates the 7 domain-specific contexts into the flat shape
 * that useAppController and other callsites still expect.
 *
 * No useState calls live here any more — every piece of state is owned by one
 * of the dedicated Context providers.
 */
import { useNavigationContext } from "../contexts/NavigationContext";
import { useProjectContext } from "../contexts/ProjectContext";
import { useIterationContext } from "../contexts/IterationContext";
import { useChatContext } from "../contexts/ChatContext";
import { useAnalysisContext } from "../contexts/AnalysisContext";
import { useModelOpsContext } from "../contexts/ModelOpsContext";
import { usePlatformContext } from "../contexts/PlatformContext";

export function useWorkspaceState() {
  const nav = useNavigationContext();
  const proj = useProjectContext();
  const iter = useIterationContext();
  const chat = useChatContext();
  const analysis = useAnalysisContext();
  const modelOps = useModelOpsContext();
  const platform = usePlatformContext();

  return {
    // NavigationContext
    activeView: nav.activeView,
    setActiveView: nav.setActiveView,
    projectPanelMode: nav.projectPanelMode,
    setProjectPanelMode: nav.setProjectPanelMode,
    showUserMenu: nav.showUserMenu,
    setShowUserMenu: nav.setShowUserMenu,
    currentRole: nav.currentRole,
    setCurrentRole: nav.setCurrentRole,
    status: nav.status,
    setStatus: nav.setStatus,
    error: nav.error,
    setError: nav.setError,
    busy: nav.busy,
    setBusy: nav.setBusy,
    userMenuRef: nav.userMenuRef,

    // ProjectContext
    projects: proj.projects,
    setProjects: proj.setProjects,
    currentProjectId: proj.currentProjectId,
    setCurrentProjectId: proj.setCurrentProjectId,
    showCreateProject: proj.showCreateProject,
    setShowCreateProject: proj.setShowCreateProject,
    projectName: proj.projectName,
    setProjectName: proj.setProjectName,
    projectDesc: proj.projectDesc,
    setProjectDesc: proj.setProjectDesc,

    // IterationContext
    iterations: iter.iterations,
    setIterations: iter.setIterations,
    currentIterationId: iter.currentIterationId,
    setCurrentIterationId: iter.setCurrentIterationId,
    showCreateIteration: iter.showCreateIteration,
    setShowCreateIteration: iter.setShowCreateIteration,
    iterName: iter.iterName,
    setIterName: iter.setIterName,
    iterDesc: iter.iterDesc,
    setIterDesc: iter.setIterDesc,
    iterGoals: iter.iterGoals,
    setIterGoals: iter.setIterGoals,
    iterInScope: iter.iterInScope,
    setIterInScope: iter.setIterInScope,
    iterOutScope: iter.iterOutScope,
    setIterOutScope: iter.setIterOutScope,
    iterAcceptance: iter.iterAcceptance,
    setIterAcceptance: iter.setIterAcceptance,
    iterVersionType: iter.iterVersionType,
    setIterVersionType: iter.setIterVersionType,

    // ChatContext
    chatInput: chat.chatInput,
    setChatInput: chat.setChatInput,
    chatMessages: chat.chatMessages,
    setChatMessages: chat.setChatMessages,
    chatSendStatus: chat.chatSendStatus,
    setChatSendStatus: chat.setChatSendStatus,
    contextData: chat.contextData,
    setContextData: chat.setContextData,

    // AnalysisContext
    uploadedFile: analysis.uploadedFile,
    setUploadedFile: analysis.setUploadedFile,
    analysisReport: analysis.analysisReport,
    setAnalysisReport: analysis.setAnalysisReport,
    showAnalysisPanel: analysis.showAnalysisPanel,
    setShowAnalysisPanel: analysis.setShowAnalysisPanel,
    isAnalyzingAttachment: analysis.isAnalyzingAttachment,
    setIsAnalyzingAttachment: analysis.setIsAnalyzingAttachment,
    uploadAnalysisProgress: analysis.uploadAnalysisProgress,
    setUploadAnalysisProgress: analysis.setUploadAnalysisProgress,
    uploadToastMessage: analysis.uploadToastMessage,
    setUploadToastMessage: analysis.setUploadToastMessage,
    assessmentData: analysis.assessmentData,
    setAssessmentData: analysis.setAssessmentData,
    assessmentHistory: analysis.assessmentHistory,
    setAssessmentHistory: analysis.setAssessmentHistory,
    stateMachine: analysis.stateMachine,
    setStateMachine: analysis.setStateMachine,
    fileInputRef: analysis.fileInputRef,

    // ModelOpsContext
    modelSummary: modelOps.modelSummary,
    setModelSummary: modelOps.setModelSummary,
    modelRelations: modelOps.modelRelations,
    setModelRelations: modelOps.setModelRelations,
    ruleCompile: modelOps.ruleCompile,
    setRuleCompile: modelOps.setRuleCompile,
    ruleBind: modelOps.ruleBind,
    setRuleBind: modelOps.setRuleBind,
    syncReport: modelOps.syncReport,
    setSyncReport: modelOps.setSyncReport,
    traceReport: modelOps.traceReport,
    setTraceReport: modelOps.setTraceReport,
    roadmapReports: modelOps.roadmapReports,
    setRoadmapReports: modelOps.setRoadmapReports,
    modelOpsLoading: modelOps.modelOpsLoading,
    setModelOpsLoading: modelOps.setModelOpsLoading,
    opsMetrics: modelOps.opsMetrics,
    setOpsMetrics: modelOps.setOpsMetrics,

    // PlatformContext
    governanceRoles: platform.governanceRoles,
    setGovernanceRoles: platform.setGovernanceRoles,
    auditLogs: platform.auditLogs,
    setAuditLogs: platform.setAuditLogs,
    versionSnapshots: platform.versionSnapshots,
    setVersionSnapshots: platform.setVersionSnapshots,
    projectShares: platform.projectShares,
    setProjectShares: platform.setProjectShares,
    templates: platform.templates,
    setTemplates: platform.setTemplates,
    templateRuns: platform.templateRuns,
    setTemplateRuns: platform.setTemplateRuns,
    latestTemplateRun: platform.latestTemplateRun,
    setLatestTemplateRun: platform.setLatestTemplateRun,
    deployments: platform.deployments,
    setDeployments: platform.setDeployments,
    shareAccess: platform.shareAccess,
    setShareAccess: platform.setShareAccess,
  };
}
