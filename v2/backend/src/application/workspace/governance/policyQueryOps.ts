import type { WorkspaceRepository } from '../../../domain/workspace/repository';

const GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID = 0;

export function listProjectPoliciesOp(repo: WorkspaceRepository, projectId: number) {
  return repo.listProjectPolicies(projectId).sort((a, b) => b.version - a.version);
}

export function getActiveProjectPolicyOp(repo: WorkspaceRepository, projectId: number) {
  const items = repo.listProjectPolicies(projectId);
  return items.filter((item) => item.status === "active").sort((a, b) => b.version - a.version)[0] || null;
}

export function listGlobalOrchestrationPoliciesOp(repo: WorkspaceRepository) {
  return listProjectPoliciesOp(repo, GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID);
}

export function getActiveGlobalOrchestrationPolicyOp(repo: WorkspaceRepository) {
  return getActiveProjectPolicyOp(repo, GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID);
}

export function getEffectiveOrchestrationPolicyForProjectOp(repo: WorkspaceRepository, projectId: number) {
  return getActiveGlobalOrchestrationPolicyOp(repo) || getActiveProjectPolicyOp(repo, projectId);
}
