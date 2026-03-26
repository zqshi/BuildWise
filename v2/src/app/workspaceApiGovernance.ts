import type { AuditLog, GovernancePermissionPoint, GovernanceRole } from "../domain/workspace/governanceTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX, isApiNotFound } from "./workspaceApiCore";

export type PlatformRoleBindingPayload = {
  id: number;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceCustomRolePayload = {
  id: number;
  roleKey: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectRoleBindingPayload = {
  tenantId: string;
  userId: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
};

export async function fetchGovernance() {
  const [rolesRaw, auditLogsRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/roles`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/audit-logs?limit=30`)
  ]);
  return {
    roles: ensureArray<GovernanceRole>(rolesRaw),
    auditLogs: ensureArray<AuditLog>(auditLogsRaw)
  };
}

export async function fetchGovernancePermissionPoints() {
  try {
    const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/permission-points`);
    return ensureArray<GovernancePermissionPoint>(data);
  } catch (error) {
    if (isApiNotFound(error)) {
      return [];
    }
    throw error;
  }
}

export async function fetchProjectRoleBindings(projectId: number) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles`);
  return ensureArray<ProjectRoleBindingPayload>(data);
}

export async function upsertProjectRoleBinding(
  projectId: number,
  payload: { userId: string; role: "admin" | "member" | "viewer" },
  role = "owner"
) {
  return fetchJSON<ProjectRoleBindingPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function removeProjectRoleBinding(projectId: number, userId: string, role = "owner") {
  return fetchJSON<{ ok: boolean; projectId: number; userId: string }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function fetchPlatformRoleBindings() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings`);
  return ensureArray<PlatformRoleBindingPayload>(data);
}

export async function upsertPlatformRoleBinding(payload: { userId: string; role: string }, role = "owner") {
  return fetchJSON<PlatformRoleBindingPayload>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function removePlatformRoleBinding(userId: string, role = "owner") {
  return fetchJSON<{ ok: boolean; userId: string }>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function fetchGovernanceCustomRoles() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/custom-roles`);
  return ensureArray<GovernanceCustomRolePayload>(data);
}

export async function upsertGovernanceCustomRole(
  payload: { roleKey?: string; name: string; description?: string; level?: number; permissions?: string[] },
  role = "owner"
) {
  try {
    return await fetchJSON<GovernanceCustomRolePayload>(`${API_BASE}${API_PREFIX}/governance/custom-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (isApiNotFound(error)) {
      return fetchJSON<GovernanceCustomRolePayload>(`${API_BASE}${API_PREFIX}/governance/custom_roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify(payload)
      });
    }
    throw error;
  }
}
