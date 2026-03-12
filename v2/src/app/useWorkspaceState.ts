import { useRef, useState } from "react";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type {
  AttachmentAnalysisReport,
  AssessmentPayload,
  AssessmentSnapshot,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
  ChatSendStatus,
  ModelRelationPayload,
  ModelSummaryPayload,
  RoadmapPayload,
  Project,
  RuleBindPayload,
  RuleCompilePayload,
  StatusPayload,
  SyncReportPayload,
  TracePayload
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import type { AuditLog, GovernanceRole } from "../domain/workspace/governanceTypes";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  ProjectShare,
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot
} from "../domain/workspace/platformTypes";

function readStorageString(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStorageNumber(key: string): number | null {
  const raw = readStorageString(key);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStorageRole(key: string): "owner" | "pm" | "developer" | "qa" | "viewer" {
  const raw = readStorageString(key);
  if (raw === "owner" || raw === "pm" || raw === "developer" || raw === "qa" || raw === "viewer") {
    return raw;
  }
  return "viewer";
}

export function useWorkspaceState() {
  const [activeView, setActiveView] = useState<"dashboard" | "projects" | "permissions">(() => {
    const cached = readStorageString("buildwise:active-view");
    if (cached === "projects" || cached === "permissions") {
      return cached;
    }
    return "dashboard";
  });
  const [projectPanelMode, setProjectPanelMode] = useState<"project" | "iteration">(() => {
    const cached = readStorageString("buildwise:project-panel-mode");
    return cached === "iteration" ? "iteration" : "project";
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentRole, setCurrentRole] = useState<"owner" | "pm" | "developer" | "qa" | "viewer">(
    () => readStorageRole("buildwise:auth-role")
  );
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(() => readStorageNumber("buildwise:current-project-id"));
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [currentIterationId, setCurrentIterationId] = useState<number | null>(() => readStorageNumber("buildwise:current-iteration-id"));
  const [showCreateIteration, setShowCreateIteration] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [busy, setBusy] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [iterName, setIterName] = useState("");
  const [iterDesc, setIterDesc] = useState("");
  const [iterGoals, setIterGoals] = useState("");
  const [iterInScope, setIterInScope] = useState("");
  const [iterOutScope, setIterOutScope] = useState("");
  const [iterAcceptance, setIterAcceptance] = useState("");
  const [iterVersionType, setIterVersionType] = useState<IterationVersionType>("patch");

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<IterationMessage[]>([]);
  const [chatSendStatus, setChatSendStatus] = useState<ChatSendStatus>("idle");
  const [uploadedFile, setUploadedFile] = useState<UploadedAttachmentMeta | null>(null);
  const [contextData, setContextData] = useState<IterationContextPayload | null>(null);
  const [assessmentData, setAssessmentData] = useState<AssessmentPayload | null>(null);
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentSnapshot[]>([]);
  const [stateMachine, setStateMachine] = useState<IterationStateMachinePayload | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AttachmentAnalysisReport | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [isAnalyzingAttachment, setIsAnalyzingAttachment] = useState(false);
  const [uploadAnalysisProgress, setUploadAnalysisProgress] = useState<UploadAnalysisProgress | null>(null);
  const [uploadToastMessage, setUploadToastMessage] = useState<string | null>(null);
  const [modelSummary, setModelSummary] = useState<ModelSummaryPayload | null>(null);
  const [modelRelations, setModelRelations] = useState<ModelRelationPayload[]>([]);
  const [ruleCompile, setRuleCompile] = useState<RuleCompilePayload | null>(null);
  const [ruleBind, setRuleBind] = useState<RuleBindPayload | null>(null);
  const [syncReport, setSyncReport] = useState<SyncReportPayload | null>(null);
  const [traceReport, setTraceReport] = useState<TracePayload | null>(null);
  const [roadmapReports, setRoadmapReports] = useState<RoadmapPayload[]>([]);
  const [modelOpsLoading, setModelOpsLoading] = useState(false);
  const [governanceRoles, setGovernanceRoles] = useState<GovernanceRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [versionSnapshots, setVersionSnapshots] = useState<VersionSnapshot[]>([]);
  const [projectShares, setProjectShares] = useState<ProjectShare[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateRuns, setTemplateRuns] = useState<TemplateRunHistory[]>([]);
  const [latestTemplateRun, setLatestTemplateRun] = useState<TemplateRunResult | null>(null);
  const [opsMetrics, setOpsMetrics] = useState<OpsMetricsPayload | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [shareAccess, setShareAccess] = useState<ShareAccessPayload | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  return {
    activeView,
    setActiveView,
    projectPanelMode,
    setProjectPanelMode,
    showUserMenu,
    setShowUserMenu,
    currentRole,
    setCurrentRole,
    status,
    setStatus,
    error,
    setError,
    projects,
    setProjects,
    currentProjectId,
    setCurrentProjectId,
    iterations,
    setIterations,
    currentIterationId,
    setCurrentIterationId,
    showCreateIteration,
    setShowCreateIteration,
    showCreateProject,
    setShowCreateProject,
    busy,
    setBusy,
    projectName,
    setProjectName,
    projectDesc,
    setProjectDesc,
    iterName,
    setIterName,
    iterDesc,
    setIterDesc,
    iterGoals,
    setIterGoals,
    iterInScope,
    setIterInScope,
    iterOutScope,
    setIterOutScope,
    iterAcceptance,
    setIterAcceptance,
    iterVersionType,
    setIterVersionType,
    chatInput,
    setChatInput,
    chatMessages,
    setChatMessages,
    chatSendStatus,
    setChatSendStatus,
    uploadedFile,
    setUploadedFile,
    contextData,
    setContextData,
    assessmentData,
    setAssessmentData,
    assessmentHistory,
    setAssessmentHistory,
    stateMachine,
    setStateMachine,
    analysisReport,
    setAnalysisReport,
    showAnalysisPanel,
    setShowAnalysisPanel,
    isAnalyzingAttachment,
    setIsAnalyzingAttachment,
    uploadAnalysisProgress,
    setUploadAnalysisProgress,
    uploadToastMessage,
    setUploadToastMessage,
    modelSummary,
    setModelSummary,
    modelRelations,
    setModelRelations,
    ruleCompile,
    setRuleCompile,
    ruleBind,
    setRuleBind,
    syncReport,
    setSyncReport,
    traceReport,
    setTraceReport,
    roadmapReports,
    setRoadmapReports,
    modelOpsLoading,
    setModelOpsLoading,
    governanceRoles,
    setGovernanceRoles,
    auditLogs,
    setAuditLogs,
    versionSnapshots,
    setVersionSnapshots,
    projectShares,
    setProjectShares,
    templates,
    setTemplates,
    templateRuns,
    setTemplateRuns,
    latestTemplateRun,
    setLatestTemplateRun,
    opsMetrics,
    setOpsMetrics,
    deployments,
    setDeployments,
    shareAccess,
    setShareAccess,
    fileInputRef,
    userMenuRef
  };
}
