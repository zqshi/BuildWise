import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';
import type {
  ProjectWorkspaceBindingRecord,
  ProjectRoleBindingRecord,
  TenantMemberBindingRecord
} from '../../../domain/workspace/types';

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
}

export function upsertProjectWorkspaceBindingOp(
  repo: WorkspaceRepository,
  input: Omit<ProjectWorkspaceBindingRecord, "id" | "createdAt" | "updatedAt">
) {
  const existing = repo.listProjectWorkspaceBindings(input.projectId)[0];
  const now = nowIso();
  const record: ProjectWorkspaceBindingRecord = {
    id: existing?.id || nextId(repo.listProjectWorkspaceBindings(input.projectId)),
    projectId: input.projectId,
    assistantProfile: input.assistantProfile,
    agentId: input.agentId,
    workspacePath: input.workspacePath,
    runtimeMode: input.runtimeMode,
    locked: input.locked,
    createdBy: existing?.createdBy || input.createdBy,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return repo.upsertProjectWorkspaceBinding(record);
}

export function upsertProjectRoleBindingOp(
  repo: WorkspaceRepository,
  input: Omit<ProjectRoleBindingRecord, "id" | "createdAt" | "updatedAt">
) {
  const existing = repo
    .listProjectRoleBindings(input.projectId)
    .find((item) => item.userId === input.userId);
  const now = nowIso();
  const record: ProjectRoleBindingRecord = {
    id: existing?.id || nextId(repo.listProjectRoleBindings(input.projectId)),
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return repo.upsertProjectRoleBinding(record);
}

export function listProjectRoleBindingsOp(repo: WorkspaceRepository, projectId: number) {
  return repo.listProjectRoleBindings(projectId);
}

export function removeProjectRoleBindingOp(repo: WorkspaceRepository, projectId: number, userId: string) {
  return repo.removeProjectRoleBinding(projectId, userId);
}

export function upsertTenantMemberBindingOp(
  repo: WorkspaceRepository,
  input: Omit<TenantMemberBindingRecord, "id" | "createdAt" | "updatedAt">
) {
  const existing = repo
    .listTenantMemberBindings(input.tenantId)
    .find((item) => item.userId === input.userId);
  const now = nowIso();
  const record: TenantMemberBindingRecord = {
    id: existing?.id || nextId(repo.listTenantMemberBindings(input.tenantId)),
    tenantId: input.tenantId,
    userId: input.userId,
    role: input.role,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return repo.upsertTenantMemberBinding(record);
}

export function removeTenantMemberBindingOp(repo: WorkspaceRepository, tenantId: string, userId: string) {
  return repo.removeTenantMemberBinding(tenantId, userId);
}

export function listPlatformRoleBindingsOp(repo: WorkspaceRepository) {
  return repo.listPlatformRoleBindings();
}

export function upsertPlatformRoleBindingOp(
  repo: WorkspaceRepository,
  input: { userId: string; role: string }
) {
  const existing = repo.listPlatformRoleBindings().find((item) => item.userId === input.userId);
  const now = nowIso();
  return repo.upsertPlatformRoleBinding({
    id: existing?.id || nextId(repo.listPlatformRoleBindings()),
    userId: input.userId,
    role: input.role,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });
}

export function removePlatformRoleBindingOp(repo: WorkspaceRepository, userId: string) {
  return repo.removePlatformRoleBinding(userId);
}

export function listGovernanceCustomRolesOp(repo: WorkspaceRepository) {
  return repo.listGovernanceCustomRoles();
}

export function upsertGovernanceCustomRoleOp(
  repo: WorkspaceRepository,
  input: { roleKey?: string; name: string; description: string; level: number; permissions: string[] }
) {
  const now = nowIso();
  const normalizedRoleKey =
    input.roleKey?.trim() ||
    `custom-${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now()}`;
  const existing = repo.listGovernanceCustomRoles().find((item) => item.roleKey === normalizedRoleKey);
  const safeLevel = Number.isFinite(input.level) ? Math.max(1, Math.floor(input.level)) : 1;
  const permissions = Array.isArray(input.permissions)
    ? [...new Set(input.permissions.map((item) => item.trim()).filter(Boolean))]
    : [];
  return repo.upsertGovernanceCustomRole({
    id: existing?.id || nextId(repo.listGovernanceCustomRoles()),
    roleKey: normalizedRoleKey,
    name: input.name.trim(),
    description: input.description.trim(),
    level: safeLevel,
    permissions,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });
}

export function removeGovernanceCustomRoleOp(repo: WorkspaceRepository, roleKey: string) {
  return repo.removeGovernanceCustomRole(roleKey);
}
