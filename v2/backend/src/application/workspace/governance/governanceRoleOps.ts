import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
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
