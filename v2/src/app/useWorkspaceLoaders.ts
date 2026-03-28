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

export function useWorkspaceLoaders({
  currentProjectId,
  setStatus,
  setError,
  setProjects,
  setProjectsHydrated,
  setCurrentProjectId,
  setIterations,
  setCurrentIterationId,
  setChatMessages,
  setContextData,
  setAssessmentData,
  setAssessmentHistory,
  setStateMachine,
  setGovernanceRoles,
  setAuditLogs,
  setVersionSnapshots,
  setProjectShares,
  setTemplates,
  setTemplateRuns,
  setOpsMetrics,
  setDeployments
}: UseWorkspaceLoadersParams) {
  const statusRef = useRef<StatusPayload | null>(null);
  const toOfflineMessage = (raw: string) =>
    raw.includes("network unavailable") || raw.includes("request timeout")
      ? `后端服务不可用（${apiBaseLabel()}）。请先启动：npm --prefix v2/backend run dev`
      : raw;

  const isBackendError = (msg: string | null) =>
    !!msg &&
    (msg.includes("后端服务不可用") ||
      msg.includes("后端服务不可达") ||
      msg.includes("network unavailable") ||
      msg.includes("too many requests"));

  const isAuthError = (msg: string) =>
    msg.includes("401") || msg.includes("unauthorized") || msg.includes("bearer token");

  const probeStatus = useCallback(async () => {
    try {
      const statusData = await fetchJSON<StatusPayload>(`${API_BASE}${API_PREFIX}/status`);
      const wasOffline = statusRef.current?.status === "offline";
      setStatus(statusData);
      statusRef.current = statusData;
      setError((prev) => (isBackendError(prev) ? null : prev));
      return { ok: true as const, recovered: wasOffline };
    } catch (err) {
      const raw = resolveErrorMessage(err);
      const offlineStatus = { status: "offline" as const, service: "buildwise-v2-backend" };
      setStatus(offlineStatus);
      statusRef.current = offlineStatus;
      return { ok: false as const, raw, recovered: false };
    }
  }, [setError, setStatus]);

  const loadProjects = useCallback(async () => {
    // 仅首次加载时标记未就绪，后续刷新静默进行，避免页面闪烁
    setProjectsHydrated((prev) => (prev ? prev : false));
    try {
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
    } finally {
      setProjectsHydrated(true);
    }
  }, [currentProjectId, setCurrentProjectId, setProjects, setProjectsHydrated]);

  const loadIterations = useCallback(async (projectId: number) => {
    const data = await fetchProjectIterations(projectId);
    setIterations(data);
    if (data.length === 0) {
      setCurrentIterationId(null);
      return;
    }
    setCurrentIterationId((prev) => {
      if (prev !== null && data.some((item) => item.id === prev)) {
        return prev;
      }
      const current = data.find((item) => item.current) ?? data[data.length - 1];
      return current.id;
    });
  }, [setCurrentIterationId, setIterations]);

  const loadIterationDetail = useCallback(async (iterationId: number) => {
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
  }, [setAssessmentData, setAssessmentHistory, setChatMessages, setContextData, setStateMachine]);

  const loadPlatformOps = useCallback(async (projectId?: number) => {
    try {
      const reports = await fetchPlatformOps(projectId);
      setTemplates(reports.templates);
      setTemplateRuns(reports.templateRuns);
      setOpsMetrics(reports.opsMetrics);
      setDeployments(reports.deployments);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthError(msg)) {
        setError(msg);
      }
    }
  }, [setDeployments, setError, setOpsMetrics, setTemplateRuns, setTemplates]);

  const loadGovernance = useCallback(async () => {
    try {
      const data = await fetchGovernance();
      setGovernanceRoles(data.roles);
      setAuditLogs(data.auditLogs);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthError(msg)) {
        setError(msg);
      }
    }
  }, [setAuditLogs, setError, setGovernanceRoles]);

  const loadCollaboration = useCallback(async (projectId: number) => {
    try {
      const data = await fetchCollaboration(projectId);
      setVersionSnapshots(data.snapshots);
      setProjectShares(data.shares);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      if (!isAuthError(msg)) {
        setError(msg);
      }
    }
  }, [setError, setProjectShares, setVersionSnapshots]);

  useEffect(() => {
    let stopped = false;
    const bootstrap = async () => {
      try {
        const statusData = await fetchStatusWithRetry();
        if (stopped) {
          return;
        }
        setStatus(statusData);
        statusRef.current = statusData;
        setError(null);
      } catch (err) {
        if (stopped) {
          return;
        }
        const offlineStatus = { status: "offline" as const, service: "buildwise-v2-backend" };
        setStatus(offlineStatus);
        statusRef.current = offlineStatus;
        const raw = resolveErrorMessage(err);
        setError(toOfflineMessage(raw));
        return;
      }

      try {
        await Promise.all([loadProjects(), loadGovernance()]);
      } catch (err) {
        if (stopped) {
          return;
        }
        // 401 意味着未认证，auth-expired 事件会跳转登录页，不需要重试
        const errMsg = resolveErrorMessage(err);
        if (errMsg.includes("401")) {
          return;
        }
        // 首次加载失败可能是后端刚启动或 token 尚未就绪，3秒后静默重试一次
        await new Promise((r) => setTimeout(r, 3000));
        if (stopped) return;
        try {
          await Promise.all([loadProjects(), loadGovernance()]);
        } catch (retryErr) {
          if (!stopped) {
            setError(resolveErrorMessage(retryErr));
          }
        }
      }
    };
    bootstrap();
    const timer = window.setInterval(async () => {
      const result = await probeStatus();
      if (!result.ok) {
        setError((prev) => {
          if (prev && !isBackendError(prev)) {
            return prev;
          }
          return toOfflineMessage(result.raw);
        });
        return;
      }
      if (stopped) {
        return;
      }
      if (result.recovered) {
        try {
          await Promise.all([loadProjects(), loadGovernance()]);
        } catch (recoveryErr) {
          console.warn("[workspace] recovery reload failed:", recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr));
        }
      }
    }, STATUS_POLL_INTERVAL_MS);
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
