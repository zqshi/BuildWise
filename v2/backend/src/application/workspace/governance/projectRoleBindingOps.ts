import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';
import type {
  ProjectWorkspaceBindingRecord,
  ProjectRoleBindingRecord
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
