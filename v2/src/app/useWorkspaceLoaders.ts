import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
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
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  ProjectShare,
  TemplateItem,
  TemplateRunHistory,
  VersionSnapshot
} from "../domain/workspace/platformTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import {
  fetchCollaboration,
  fetchGovernance,
  fetchIterationDetail,
  fetchIterationStateMachine,
  fetchModelOps,
  fetchProjectIterations,
  fetchProjects
} from "./workspaceApi";
import { nowIsoString } from "./workspaceHelpers";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5055";
const BOOT_RETRY_DELAYS_MS = [0, 500, 1200, 2500];
const STATUS_POLL_INTERVAL_MS = 15000;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchStatusWithRetry() {
  let lastError: unknown = null;
  for (const delay of BOOT_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await wait(delay);
    }
    try {
      return await fetchJSON<StatusPayload>(`${API_BASE}/api/status`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("API error: network unavailable");
}

type UseWorkspaceLoadersParams = {
  currentProjectId: number | null;
  setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setCurrentProjectId: Dispatch<SetStateAction<number | null>>;
  setIterations: Dispatch<SetStateAction<Iteration[]>>;
  setCurrentIterationId: Dispatch<SetStateAction<number | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setContextData: Dispatch<SetStateAction<IterationContextPayload | null>>;
  setAssessmentData: Dispatch<SetStateAction<AssessmentPayload | null>>;
  setAssessmentHistory: Dispatch<SetStateAction<AssessmentSnapshot[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setModelSummary: Dispatch<SetStateAction<ModelSummaryPayload | null>>;
  setModelRelations: Dispatch<SetStateAction<ModelRelationPayload[]>>;
  setRuleCompile: Dispatch<SetStateAction<RuleCompilePayload | null>>;
  setRuleBind: Dispatch<SetStateAction<RuleBindPayload | null>>;
  setSyncReport: Dispatch<SetStateAction<SyncReportPayload | null>>;
  setTraceReport: Dispatch<SetStateAction<TracePayload | null>>;
  setRoadmapReports: Dispatch<SetStateAction<RoadmapPayload[]>>;
  setModelOpsLoading: Dispatch<SetStateAction<boolean>>;
  setGovernanceRoles: Dispatch<SetStateAction<GovernanceRole[]>>;
  setAuditLogs: Dispatch<SetStateAction<AuditLog[]>>;
  setVersionSnapshots: Dispatch<SetStateAction<VersionSnapshot[]>>;
  setProjectShares: Dispatch<SetStateAction<ProjectShare[]>>;
  setTemplates: Dispatch<SetStateAction<TemplateItem[]>>;
  setTemplateRuns: Dispatch<SetStateAction<TemplateRunHistory[]>>;
  setOpsMetrics: Dispatch<SetStateAction<OpsMetricsPayload | null>>;
  setDeployments: Dispatch<SetStateAction<DeploymentRecord[]>>;
};

export function useWorkspaceLoaders({
  currentProjectId,
  setStatus,
  setError,
  setProjects,
  setCurrentProjectId,
  setIterations,
  setCurrentIterationId,
  setChatMessages,
  setContextData,
  setAssessmentData,
  setAssessmentHistory,
  setStateMachine,
  setModelSummary,
  setModelRelations,
  setRuleCompile,
  setRuleBind,
  setSyncReport,
  setTraceReport,
  setRoadmapReports,
  setModelOpsLoading,
  setGovernanceRoles,
  setAuditLogs,
  setVersionSnapshots,
  setProjectShares,
  setTemplates,
  setTemplateRuns,
  setOpsMetrics,
  setDeployments
}: UseWorkspaceLoadersParams) {
  const toOfflineMessage = (raw: string) =>
    raw.includes("network unavailable") || raw.includes("request timeout")
      ? "后端服务不可用（127.0.0.1:5055）。请先启动：npm --prefix v2/backend run dev"
      : raw;

  const probeStatus = async () => {
    try {
      const statusData = await fetchJSON<StatusPayload>(`${API_BASE}/api/status`);
      setStatus(statusData);
      setError((prev) => (prev && prev.includes("后端服务不可用") ? null : prev));
      return { ok: true as const };
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unknown error";
      setStatus({ status: "offline", service: "buildwise-v2-backend" });
      return { ok: false as const, raw };
    }
  };

  const loadProjects = async () => {
    const projectData = await fetchProjects();
    setProjects(projectData);
    if (projectData.length === 0) {
      setCurrentProjectId(null);
      return projectData;
    }
    const hasCurrentProject = projectData.some((item) => item.id === currentProjectId);
    if (!currentProjectId || !hasCurrentProject) {
      setCurrentProjectId(projectData[0].id);
    }
    return projectData;
  };

  const loadIterations = async (projectId: number) => {
    const data = await fetchProjectIterations(projectId);
    setIterations(data);
    if (data.length === 0) {
      setCurrentIterationId(null);
      return;
    }
    const current = data.find((item) => item.current) ?? data[data.length - 1];
    setCurrentIterationId(current.id);
  };

  const loadIterationDetail = async (iterationId: number) => {
    const [{ messages, context, assessment, history }, machine] = await Promise.all([
      fetchIterationDetail(iterationId),
      fetchIterationStateMachine(iterationId)
    ]);
    if (messages.length === 0) {
      const firstMessage: IterationMessage = {
        id: -1,
        iterationId,
        role: "assistant",
        content: "请围绕当前迭代范围沟通需求，输入“开始拆解任务”可生成本迭代执行清单。",
        createdAt: nowIsoString()
      };
      setChatMessages([firstMessage]);
    } else {
      setChatMessages(messages);
    }
    setContextData(context);
    setAssessmentData(assessment);
    setAssessmentHistory(history);
    setStateMachine(machine);
  };

  const loadModelOps = async (projectId?: number) => {
    try {
      setModelOpsLoading(true);
      const reports = await fetchModelOps(projectId);
      setModelSummary(reports.modelSummary);
      setModelRelations(reports.modelRelations);
      setRuleCompile(reports.ruleCompile);
      setRuleBind(reports.ruleBind);
      setSyncReport(reports.syncReport);
      setTraceReport(reports.traceReport);
      setRoadmapReports(reports.roadmapReports);
      setTemplates(reports.templates);
      setTemplateRuns(reports.templateRuns);
      setOpsMetrics(reports.opsMetrics);
      setDeployments(reports.deployments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setModelOpsLoading(false);
    }
  };

  const loadGovernance = async () => {
    try {
      const data = await fetchGovernance();
      setGovernanceRoles(data.roles);
      setAuditLogs(data.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const loadCollaboration = async (projectId: number) => {
    try {
      const data = await fetchCollaboration(projectId);
      setVersionSnapshots(data.snapshots);
      setProjectShares(data.shares);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    let stopped = false;
    const bootstrap = async () => {
      try {
        const statusData = await fetchStatusWithRetry();
        if (stopped) {
          return;
        }
        setStatus(statusData);
        setError(null);
        await Promise.all([loadProjects(), loadGovernance()]);
      } catch (err) {
        if (stopped) {
          return;
        }
        setStatus({ status: "offline", service: "buildwise-v2-backend" });
        const raw = err instanceof Error ? err.message : "Unknown error";
        setError(toOfflineMessage(raw));
      }
    };
    bootstrap();
    const timer = window.setInterval(async () => {
      const result = await probeStatus();
      if (!result.ok) {
        setError((prev) => {
          if (prev && !prev.includes("后端服务不可用")) {
            return prev;
          }
          return toOfflineMessage(result.raw);
        });
        return;
      }
      if (stopped) {
        return;
      }
      setError((prev) => (prev && prev.includes("后端服务不可用") ? null : prev));
    }, STATUS_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loadProjects, loadIterations, loadIterationDetail, loadModelOps, loadGovernance, loadCollaboration };
}
