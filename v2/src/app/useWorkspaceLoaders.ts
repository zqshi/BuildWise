import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AssessmentPayload,
  AssessmentSnapshot,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
  Project,
  StatusPayload,
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
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import {
  fetchCollaboration,
  fetchGovernance,
  fetchIterationDetail,
  fetchIterationStateMachine,
  fetchPlatformOps,
  fetchProjectIterations,
  fetchProjects
} from "./workspaceApi";
import { nowIsoString } from "./workspaceHelpers";

import { API_BASE, API_PREFIX } from "./workspaceApiCore";
const BOOT_RETRY_DELAYS_MS = [0, 500, 1200, 2500];
const STATUS_POLL_INTERVAL_MS = 15000;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function apiBaseLabel() {
  if (API_BASE) {
    return API_BASE;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "current-origin";
}

async function fetchStatusWithRetry() {
  let lastError: unknown = null;
  for (const delay of BOOT_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await wait(delay);
    }
    try {
      return await fetchJSON<StatusPayload>(`${API_BASE}${API_PREFIX}/status`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("API error: network unavailable");
}

interface BootstrapDeps {
  stopped: () => boolean;
  setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
  statusRef: React.MutableRefObject<StatusPayload | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  toOfflineMessage: (raw: string) => string;
  loadProjects: () => Promise<Project[]>;
  loadGovernance: () => Promise<void>;
}

async function bootstrapWorkspace(deps: BootstrapDeps) {
  try {
    const statusData = await fetchStatusWithRetry();
    if (deps.stopped()) return;
    deps.setStatus(statusData);
    deps.statusRef.current = statusData;
    deps.setError(null);
  } catch (err) {
    if (deps.stopped()) return;
    const offlineStatus = { status: "offline" as const, service: "buildwise-v2-backend" };
    deps.setStatus(offlineStatus);
    deps.statusRef.current = offlineStatus;
    const raw = resolveErrorMessage(err);
    deps.setError(deps.toOfflineMessage(raw));
    return;
  }

  try {
    await Promise.all([deps.loadProjects(), deps.loadGovernance()]);
  } catch (err) {
    if (deps.stopped()) return;
    const errMsg = resolveErrorMessage(err);
    if (errMsg.includes("401")) return;
    await new Promise((r) => setTimeout(r, 3000));
    if (deps.stopped()) return;
    try {
      await Promise.all([deps.loadProjects(), deps.loadGovernance()]);
    } catch (retryErr) {
      if (!deps.stopped()) {
        deps.setError(resolveErrorMessage(retryErr));
      }
    }
  }
}

interface StatusPollDeps {
  stopped: () => boolean;
  probeStatus: () => Promise<{ ok: true; recovered: boolean } | { ok: false; raw: string; recovered: boolean }>;
  setError: Dispatch<SetStateAction<string | null>>;
  isBackendError: (msg: string | null) => boolean;
  toOfflineMessage: (raw: string) => string;
  loadProjects: () => Promise<Project[]>;
  loadGovernance: () => Promise<void>;
}

async function runStatusPoll(deps: StatusPollDeps) {
  const result = await deps.probeStatus();
  if (!result.ok) {
    deps.setError((prev) => {
      if (prev && !deps.isBackendError(prev)) return prev;
      return deps.toOfflineMessage(result.raw);
    });
    return;
  }
  if (deps.stopped()) return;
  if (result.recovered) {
    try {
      await Promise.all([deps.loadProjects(), deps.loadGovernance()]);
    } catch (recoveryErr) {
      console.warn("[workspace] recovery reload failed:", recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr));
    }
  }
}

type UseWorkspaceLoadersParams = {
  currentProjectId: number | null;
  setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setProjectsHydrated: Dispatch<SetStateAction<boolean>>;
  setCurrentProjectId: Dispatch<SetStateAction<number | null>>;
  setIterations: Dispatch<SetStateAction<Iteration[]>>;
  setCurrentIterationId: Dispatch<SetStateAction<number | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setContextData: Dispatch<SetStateAction<IterationContextPayload | null>>;
  setAssessmentData: Dispatch<SetStateAction<AssessmentPayload | null>>;
  setAssessmentHistory: Dispatch<SetStateAction<AssessmentSnapshot[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setGovernanceRoles: Dispatch<SetStateAction<GovernanceRole[]>>;
  setAuditLogs: Dispatch<SetStateAction<AuditLog[]>>;
  setVersionSnapshots: Dispatch<SetStateAction<VersionSnapshot[]>>;
  setProjectShares: Dispatch<SetStateAction<ProjectShare[]>>;
  setTemplates: Dispatch<SetStateAction<TemplateItem[]>>;
  setTemplateRuns: Dispatch<SetStateAction<TemplateRunHistory[]>>;
  setOpsMetrics: Dispatch<SetStateAction<OpsMetricsPayload | null>>;
  setDeployments: Dispatch<SetStateAction<DeploymentRecord[]>>;
};

function isBackendErrorMsg(msg: string | null) {
  return !!msg &&
    (msg.includes("后端服务不可用") ||
      msg.includes("后端服务不可达") ||
      msg.includes("network unavailable") ||
      msg.includes("too many requests"));
}

function isAuthErrorMsg(msg: string) {
  return msg.includes("401") || msg.includes("unauthorized") || msg.includes("bearer token");
}

/* ---------- sub-hook 1: core data loaders ---------- */

type DataLoaderDeps = Pick<
  UseWorkspaceLoadersParams,
  "setProjects" | "setProjectsHydrated" | "setCurrentProjectId" |
  "setIterations" | "setCurrentIterationId" |
  "setChatMessages" | "setContextData" | "setAssessmentData" |
  "setAssessmentHistory" | "setStateMachine"
>;

function buildDefaultMessage(iterationId: number): IterationMessage {
  return { id: -1, iterationId, role: "assistant", content: "请围绕当前迭代范围沟通需求，输入\u201c开始拆解任务\u201d可生成本迭代执行清单。", createdAt: nowIsoString() };
}

function useWorkspaceDataLoaders(deps: DataLoaderDeps) {
  const { setProjects, setProjectsHydrated, setCurrentProjectId, setIterations, setCurrentIterationId, setChatMessages, setContextData, setAssessmentData, setAssessmentHistory, setStateMachine } = deps;

  const loadProjects = useCallback(async () => {
    setProjectsHydrated((prev) => (prev ? prev : false));
    try {
      const projectData = await fetchProjects();
      setProjects(projectData);
      if (projectData.length === 0) { setCurrentProjectId((prev) => (prev === null ? null : prev)); return projectData; }
      setCurrentProjectId((prev) => {
        if (prev !== null && projectData.some((item) => item.id === prev)) return prev;
        return projectData[0].id;
      });
      return projectData;
    } finally { setProjectsHydrated(true); }
  }, [setCurrentProjectId, setProjects, setProjectsHydrated]);

  const loadIterations = useCallback(async (projectId: number) => {
    const data = await fetchProjectIterations(projectId);
    setIterations(data);
    if (data.length === 0) { setCurrentIterationId(null); return; }
    setCurrentIterationId((prev) => {
      if (prev !== null && data.some((item) => item.id === prev)) return prev;
      return (data.find((item) => item.current) ?? data[data.length - 1]).id;
    });
  }, [setCurrentIterationId, setIterations]);

  const loadIterationDetail = useCallback(async (iterationId: number) => {
    const [{ messages, context, assessment, history }, machine] = await Promise.all([fetchIterationDetail(iterationId), fetchIterationStateMachine(iterationId)]);
    setChatMessages(messages.length === 0 ? [buildDefaultMessage(iterationId)] : messages);
    setContextData(context); setAssessmentData(assessment); setAssessmentHistory(history); setStateMachine(machine);
    if (context?.iteration) {
      const fresh = context.iteration;
      setIterations((prev) => prev.map((item) => (item.id === fresh.id ? fresh : item)));
    }
  }, [setAssessmentData, setAssessmentHistory, setChatMessages, setContextData, setIterations, setStateMachine]);

  return { loadProjects, loadIterations, loadIterationDetail };
}

/* ---------- sub-hook 2: auxiliary loaders ---------- */

type AuxLoaderDeps = Pick<
  UseWorkspaceLoadersParams,
  "setStatus" | "setError" |
  "setGovernanceRoles" | "setAuditLogs" |
  "setVersionSnapshots" | "setProjectShares" |
  "setTemplates" | "setTemplateRuns" | "setOpsMetrics" | "setDeployments"
>;

function useWorkspaceAuxLoaders(deps: AuxLoaderDeps) {
  const { setStatus, setError, setGovernanceRoles, setAuditLogs, setVersionSnapshots, setProjectShares, setTemplates, setTemplateRuns, setOpsMetrics, setDeployments } = deps;
  const statusRef = useRef<StatusPayload | null>(null);

  const probeStatus = useCallback(async () => {
    try {
      const statusData = await fetchJSON<StatusPayload>(`${API_BASE}${API_PREFIX}/status`);
      const wasOffline = statusRef.current?.status === "offline";
      setStatus(statusData);
      statusRef.current = statusData;
      setError((prev) => (isBackendErrorMsg(prev) ? null : prev));
      return { ok: true as const, recovered: wasOffline };
    } catch (err) {
      const raw = resolveErrorMessage(err);
      const offlineStatus = { status: "offline" as const, service: "buildwise-v2-backend" };
      setStatus(offlineStatus);
      statusRef.current = offlineStatus;
      return { ok: false as const, raw, recovered: false };
    }
  }, [setError, setStatus]);

  const loadPlatformOps = useCallback(async (projectId?: number) => {
    try {
      const reports = await fetchPlatformOps(projectId);
      setTemplates(reports.templates); setTemplateRuns(reports.templateRuns);
      setOpsMetrics(reports.opsMetrics); setDeployments(reports.deployments);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthErrorMsg(msg)) setError(msg);
    }
  }, [setDeployments, setError, setOpsMetrics, setTemplateRuns, setTemplates]);

  const loadGovernance = useCallback(async () => {
    try {
      const data = await fetchGovernance();
      setGovernanceRoles(data.roles); setAuditLogs(data.auditLogs);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthErrorMsg(msg)) setError(msg);
    }
  }, [setAuditLogs, setError, setGovernanceRoles]);

  const loadCollaboration = useCallback(async (projectId: number) => {
    try {
      const data = await fetchCollaboration(projectId);
      setVersionSnapshots(data.snapshots); setProjectShares(data.shares);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthErrorMsg(msg)) setError(msg);
    }
  }, [setError, setProjectShares, setVersionSnapshots]);

  return { probeStatus, loadPlatformOps, loadGovernance, loadCollaboration, statusRef, isBackendError: isBackendErrorMsg };
}

/* ---------- main hook: compose + bootstrap ---------- */

export function useWorkspaceLoaders(params: UseWorkspaceLoadersParams) {
  const { setStatus, setError } = params;

  const { loadProjects, loadIterations, loadIterationDetail } = useWorkspaceDataLoaders(params);
  const { probeStatus, loadPlatformOps, loadGovernance, loadCollaboration, statusRef, isBackendError } =
    useWorkspaceAuxLoaders(params);

  const toOfflineMessage = (raw: string) =>
    raw.includes("network unavailable") || raw.includes("request timeout")
      ? `后端服务不可用（${apiBaseLabel()}）。请先启动：npm --prefix v2/backend run dev`
      : raw;

  useEffect(() => {
    let stopped = false;
    const isStopped = () => stopped;
    const bootDeps: BootstrapDeps = {
      stopped: isStopped, setStatus, statusRef, setError,
      toOfflineMessage, loadProjects, loadGovernance,
    };
    bootstrapWorkspace(bootDeps);
    const pollDeps: StatusPollDeps = {
      stopped: isStopped, probeStatus, setError,
      isBackendError, toOfflineMessage, loadProjects, loadGovernance,
    };
    const timer = window.setInterval(() => runStatusPoll(pollDeps), STATUS_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({ loadProjects, loadIterations, loadIterationDetail, loadPlatformOps, loadGovernance, loadCollaboration, probeStatus }),
    [loadCollaboration, loadGovernance, loadIterationDetail, loadIterations, loadPlatformOps, loadProjects, probeStatus]
  );
}
