import { useRef, useState } from "react";
import type {
  AttachmentAnalysisReport,
  AssessmentPayload,
  AssessmentSnapshot,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
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
import type { AuditLog, GovernanceRole } from "../domain/workspace/governanceTypes";

export function useWorkspaceState() {
  const [activeView, setActiveView] = useState<"dashboard" | "projects">("dashboard");
  const [projectPanelMode, setProjectPanelMode] = useState<"project" | "iteration">("project");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [currentIterationId, setCurrentIterationId] = useState<number | null>(null);
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

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<IterationMessage[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; iterationId: number } | null>(null);
  const [contextData, setContextData] = useState<IterationContextPayload | null>(null);
  const [assessmentData, setAssessmentData] = useState<AssessmentPayload | null>(null);
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentSnapshot[]>([]);
  const [stateMachine, setStateMachine] = useState<IterationStateMachinePayload | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AttachmentAnalysisReport | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [isAnalyzingAttachment, setIsAnalyzingAttachment] = useState(false);
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  return {
    activeView,
    setActiveView,
    projectPanelMode,
    setProjectPanelMode,
    showUserMenu,
    setShowUserMenu,
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
    chatInput,
    setChatInput,
    chatMessages,
    setChatMessages,
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
    fileInputRef,
    userMenuRef
  };
}
