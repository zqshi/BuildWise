import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export type ProjectPolicyPayload = {
  id: number;
  projectId: number;
  version: number;
  status: "draft" | "active" | "archived";
  strategy: Record<string, unknown>;
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  approvedAt: string;
};

export type GlobalOrchestrationPolicyPayload = ProjectPolicyPayload;

export type ProjectWorkspaceBindingPayload = {
  id: number;
  projectId: number;
  openclawProfile: string;
  agentId: string;
  workspacePath: string;
  runtimeMode: "openclaw-native" | "bridge";
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyExecutionLogPayload = {
  id: number;
  projectId: number;
  iterationId: number;
  policyVersion: number;
  stage: string;
  action: string;
  result: "success" | "blocked" | "error";
  evidence: string[];
  createdAt: string;
};

function withOptionalUserId(role: string, userId?: string) {
  const headers: Record<string, string> = { "x-role": role };
  if (userId) {
    headers["x-user-id"] = userId;
  }
  return headers;
}

export async function fetchProjectPolicies(projectId: number) {
  return fetchJSON<{ active: ProjectPolicyPayload | null; items: ProjectPolicyPayload[] }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies`);
}

export async function fetchGlobalOrchestrationPolicies() {
  return fetchJSON<{ active: GlobalOrchestrationPolicyPayload | null; items: GlobalOrchestrationPolicyPayload[] }>(
    `${API_BASE}${API_PREFIX}/governance/orchestration/policies`
  );
}

export async function createGlobalOrchestrationPolicyDraft(strategy?: Record<string, unknown>, role = "owner", userId?: string) {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...withOptionalUserId(role, userId) },
    body: JSON.stringify({ strategy: strategy || {} })
  });
}

export async function activateGlobalOrchestrationPolicy(version: number, role = "owner", userId?: string) {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies/${version}/activate`, {
    method: "POST",
    headers: withOptionalUserId(role, userId)
  });
}

export async function restoreGlobalOrchestrationPolicyToInitialMode(role = "owner", userId?: string) {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies/restore-initial`, {
    method: "POST",
    headers: withOptionalUserId(role, userId)
  });
}

export async function createProjectPolicyDraft(projectId: number, strategy?: Record<string, unknown>, role = "owner", userId?: string) {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...withOptionalUserId(role, userId) },
    body: JSON.stringify({ strategy: strategy || {} })
  });
}

export async function activateProjectPolicy(projectId: number, version: number, role = "owner", userId?: string) {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies/${version}/activate`, {
    method: "POST",
    headers: withOptionalUserId(role, userId)
  });
}

export async function restoreProjectPolicyToInitialMode(projectId: number, role = "owner", userId?: string) {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies/restore-initial`, {
    method: "POST",
    headers: withOptionalUserId(role, userId)
  });
}

export async function bindProjectWorkspace(
  projectId: number,
  payload: {
    openclawProfile: string;
    agentId?: string;
    workspacePath: string;
    runtimeMode?: "openclaw-native" | "bridge";
    locked?: boolean;
  },
  role = "owner",
  userId?: string
) {
  return fetchJSON<ProjectWorkspaceBindingPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/workspace/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...withOptionalUserId(role, userId) },
    body: JSON.stringify(payload)
  });
}

export async function executePolicyStep(iterationId: number, payload: { action?: string; message?: string }) {
  return fetchJSON<{ ok: boolean; gate: { blocked: boolean; stage: string; reason: string; requiredActions: string[] }; policyVersion: number }>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/policy-execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export async function fetchIterationPolicyLogs(iterationId: number) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/policy-log`);
  return ensureArray<PolicyExecutionLogPayload>(data);
}
