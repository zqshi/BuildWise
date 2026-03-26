import type {
  OpsAlertTriageResponse,
} from "../domain/workspace/types";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  OpsTriageTemplatePayload,
  ProjectShare,
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot
} from "../domain/workspace/platformTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export async function fetchPlatformOps(projectId?: number) {
  const projectQuery = typeof projectId === "number" ? `?projectId=${projectId}` : "";
  const [
    templatesRaw,
    templateRunsRaw,
    opsMetrics,
    deploymentsRaw
  ] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/templates`),
    typeof projectId === "number"
      ? fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/templates/runs${projectQuery}`)
      : Promise.resolve([]),
    fetchJSON<OpsMetricsPayload>(`${API_BASE}${API_PREFIX}/ops/metrics`),
    typeof projectId === "number"
      ? fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/ops/deployments${projectQuery}`)
      : Promise.resolve([])
  ]);
  return {
    templates: ensureArray<TemplateItem>(templatesRaw),
    templateRuns: ensureArray<TemplateRunHistory>(templateRunsRaw),
    opsMetrics,
    deployments: ensureArray<DeploymentRecord>(deploymentsRaw)
  };
}

export async function fetchOpsTriageTemplates(projectId?: number) {
  const path = typeof projectId === "number" && projectId > 0
    ? `${API_BASE}${API_PREFIX}/ops/triage-templates?projectId=${projectId}`
    : `${API_BASE}${API_PREFIX}/ops/triage-templates`;
  return fetchJSON<OpsTriageTemplatePayload>(path);
}

export async function analyzeOpsAlert(payload: {
  projectId: number;
  severity?: "low" | "medium" | "high" | "critical";
  title: string;
  description?: string;
  signals?: string[];
}) {
  return fetchJSON<OpsAlertTriageResponse>(`${API_BASE}${API_PREFIX}/ops/triage/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function upsertOpsTriageTemplate(
  payload: { id?: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note?: string },
  role = "owner"
) {
  return fetchJSON<{ id: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note: string; updatedAt: string }>(
    `${API_BASE}${API_PREFIX}/ops/triage-templates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(payload)
    }
  );
}

export async function deleteOpsTriageTemplate(templateId: string, role = "owner") {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}${API_PREFIX}/ops/triage-templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function fetchCollaboration(projectId: number) {
  const [snapshotsRaw, sharesRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/collab/snapshots?projectId=${projectId}`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/collab/shares?projectId=${projectId}`)
  ]);
  return {
    snapshots: ensureArray<VersionSnapshot>(snapshotsRaw),
    shares: ensureArray<ProjectShare>(sharesRaw)
  };
}

export async function createVersionSnapshot(payload: {
  projectId: number;
  iterationId: number;
  name: string;
  note?: string;
}, role = "owner") {
  return fetchJSON<VersionSnapshot>(`${API_BASE}${API_PREFIX}/collab/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function restoreVersionSnapshot(snapshotId: number, role = "owner") {
  return fetchJSON<{ ok: boolean; snapshotId: number; iterationId: number }>(
    `${API_BASE}${API_PREFIX}/collab/snapshots/${snapshotId}/restore`,
    { method: "POST", headers: { "x-role": role } }
  );
}

export async function createProjectShare(payload: { projectId: number; permission: "read" | "comment"; ttlHours?: number }, role = "owner") {
  return fetchJSON<ProjectShare>(`${API_BASE}${API_PREFIX}/collab/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function runTemplate(templateId: string, projectId: number, parameters: Record<string, string>, role = "owner") {
  return fetchJSON<TemplateRunResult>(`${API_BASE}${API_PREFIX}/templates/${templateId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ projectId, parameters })
  });
}

export async function createDeployment(payload: {
  projectId: number;
  iterationId?: number;
  environment: "staging" | "production";
  version: string;
}, role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}${API_PREFIX}/ops/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function transitionDeployment(deploymentId: number, toStatus: "running" | "success" | "failed", role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}${API_PREFIX}/ops/deployments/${deploymentId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ toStatus })
  });
}

export async function accessShare(token: string) {
  return fetchJSON<ShareAccessPayload>(`${API_BASE}${API_PREFIX}/collab/share/${token}`);
}

export async function commentByShare(token: string, content: string) {
  return fetchJSON<{ ok: boolean; token: string; comment: string; createdAt: string }>(
    `${API_BASE}${API_PREFIX}/collab/share/${token}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    }
  );
}
