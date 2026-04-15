import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';
import type { TenantMemberBindingRecord } from '../../../domain/workspace/types';

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
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
