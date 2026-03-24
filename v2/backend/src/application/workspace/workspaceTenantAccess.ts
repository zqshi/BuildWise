import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Project } from "../../domain/workspace/types";
import { normalizeProject } from "./workspaceSupport";

export type TenantMemberRole = "admin" | "member" | "viewer";

export type ProjectAccessContext = {
  project: Project | null;
  tenantId: string;
  tenantRole: TenantMemberRole | null;
  workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  canRead: boolean;
  canWrite: boolean;
  canManageTenant: boolean;
};

export type TenantAccessContext = {
  tenantId: string;
  tenantRole: TenantMemberRole | null;
  workspaceRole: ProjectAccessContext["workspaceRole"];
  canRead: boolean;
  canWrite: boolean;
  canManageTenant: boolean;
};

export type AccessibleTenantSummary = {
  tenantId: string;
  label: string;
  role: TenantMemberRole;
  workspaceRole: ProjectAccessContext["workspaceRole"];
  isOwner: boolean;
};

function toTenantRoleProjectFallback(repo: WorkspaceRepository, projectId: number, userId: string): TenantMemberRole | null {
  const binding = repo.listProjectRoleBindings(projectId).find((item) => item.userId === userId);
  if (!binding) {
    return null;
  }
  return binding.role;
}

export function mapTenantRoleToWorkspaceRole(role: TenantMemberRole | null): ProjectAccessContext["workspaceRole"] {
  if (role === "admin") return "owner";
  if (role === "member") return "pm";
  return "viewer";
}

export function resolveProjectTenantId(project: Project) {
  return (project.tenantId || project.ownerUserId || "").trim();
}

export function resolveTenantRole(repo: WorkspaceRepository, tenantId: string, projectId: number, userId: string): TenantMemberRole | null {
  if (!tenantId || !userId) {
    return null;
  }
  if (tenantId === userId) {
    return "admin";
  }
  const tenantBinding = repo.listTenantMemberBindings(tenantId).find((item) => item.userId === userId);
  if (tenantBinding) {
    return tenantBinding.role;
  }
  return toTenantRoleProjectFallback(repo, projectId, userId);
}

export function getTenantAccessContext(repo: WorkspaceRepository, userId: string, tenantId: string): TenantAccessContext {
  const normalizedTenantId = tenantId.trim();
  const tenantRole = resolveTenantRole(repo, normalizedTenantId, -1, userId);
  const workspaceRole = mapTenantRoleToWorkspaceRole(tenantRole);
  return {
    tenantId: normalizedTenantId,
    tenantRole,
    workspaceRole,
    canRead: tenantRole !== null,
    canWrite: tenantRole === "admin" || tenantRole === "member",
    canManageTenant: tenantRole === "admin"
  };
}

export function listAccessibleTenants(repo: WorkspaceRepository, userId: string): AccessibleTenantSummary[] {
  const summaries = new Map<string, AccessibleTenantSummary>();
  const pushTenant = (tenantId: string, role: TenantMemberRole) => {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) {
      return;
    }
    const current = summaries.get(normalizedTenantId);
    const nextRank = role === "admin" ? 3 : role === "member" ? 2 : 1;
    const currentRank = current ? (current.role === "admin" ? 3 : current.role === "member" ? 2 : 1) : 0;
    if (current && currentRank >= nextRank) {
      return;
    }
    summaries.set(normalizedTenantId, {
      tenantId: normalizedTenantId,
      label: normalizedTenantId === userId ? "我的租户" : `租户 ${normalizedTenantId}`,
      role,
      workspaceRole: mapTenantRoleToWorkspaceRole(role),
      isOwner: normalizedTenantId === userId
    });
  };

  for (const item of repo.read().tenantMemberBindings) {
    if (item.userId === userId) {
      pushTenant(item.tenantId, item.role);
    }
  }
  for (const project of repo.listProjects()) {
    const tenantId = resolveProjectTenantId(project);
    const role = resolveTenantRole(repo, tenantId, project.id, userId);
    if (role) {
      pushTenant(tenantId, role);
    }
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.isOwner !== b.isOwner) {
      return a.isOwner ? -1 : 1;
    }
    return a.tenantId.localeCompare(b.tenantId);
  });
}

export function resolveCurrentTenantId(repo: WorkspaceRepository, userId: string, requestedTenantId: string) {
  const requested = requestedTenantId.trim();
  const accessible = listAccessibleTenants(repo, userId);
  if (requested && accessible.some((item) => item.tenantId === requested)) {
    return requested;
  }
  return accessible[0]?.tenantId || userId;
}

export function getProjectAccessContext(repo: WorkspaceRepository, projectId: number, userId: string): ProjectAccessContext {
  const project = repo.findProject(projectId);
  if (!project) {
    return {
      project: null,
      tenantId: "",
      tenantRole: null,
      workspaceRole: "viewer",
      canRead: false,
      canWrite: false,
      canManageTenant: false
    };
  }
  const normalized = normalizeProject(project);
  const tenantId = resolveProjectTenantId(normalized);
  const tenantRole = resolveTenantRole(repo, tenantId, projectId, userId);
  const workspaceRole = mapTenantRoleToWorkspaceRole(tenantRole);
  return {
    project: {
      ...normalized,
      tenantId,
      ownerUserId: normalized.ownerUserId || tenantId || undefined,
      currentUserRole: workspaceRole
    },
    tenantId,
    tenantRole,
    workspaceRole,
    canRead: tenantRole !== null,
    canWrite: tenantRole === "admin" || tenantRole === "member",
    canManageTenant: tenantRole === "admin"
  };
}

export function getIterationAccessContext(repo: WorkspaceRepository, iterationId: number, userId: string) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return {
      iteration: null,
      projectAccess: getProjectAccessContext(repo, -1, userId)
    };
  }
  return {
    iteration,
    projectAccess: getProjectAccessContext(repo, iteration.projectId, userId)
  };
}

export function listProjectsForUser(repo: WorkspaceRepository, userId: string, tenantId?: string) {
  const selectedTenantId = tenantId?.trim() || "";
  return repo
    .listProjects()
    .map((project) => getProjectAccessContext(repo, project.id, userId))
    .filter(
      (item) =>
        item.canRead &&
        item.project &&
        !item.project.deletedAt &&
        (!selectedTenantId || item.tenantId === selectedTenantId)
    )
    .map((item) => item.project as Project);
}
