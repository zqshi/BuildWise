import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { listAuditLogsOp, listGovernancePermissionPointsOp, listGovernanceRolesOp } from "./workspaceServiceGovernanceOps";
import { resolveRolePermissions, resolveWorkspaceRole } from "./governanceRoleResolver";
import {
  activateGlobalOrchestrationPolicyOp,
  activateProjectPolicyOp,
  appendPolicyExecutionLogOp,
  createGlobalOrchestrationPolicyDraftOp,
  createProjectPolicyDraftOp,
  evaluatePolicyGateForCoachOp,
  getEffectiveOrchestrationPolicyForProjectOp,
  getActiveGlobalOrchestrationPolicyOp,
  getActiveProjectPolicyOp,
  listGlobalOrchestrationPoliciesOp,
  listGovernanceCustomRolesOp,
  listPolicyExecutionLogsOp,
  listPlatformRoleBindingsOp,
  listProjectPoliciesOp,
  listProjectRoleBindingsOp,
  removeGovernanceCustomRoleOp,
  restoreGlobalOrchestrationPolicyToInitialModeOp,
  restoreProjectOrchestrationPolicyToInitialModeOp,
  removePlatformRoleBindingOp,
  removeProjectRoleBindingOp,
  upsertGovernanceCustomRoleOp,
  upsertPlatformRoleBindingOp,
  upsertProjectRoleBindingOp,
  upsertProjectWorkspaceBindingOp
} from "./workspaceServicePolicyOps";

export class GovernanceService {
  private readonly repo: WorkspaceRepository;
  constructor(repo: WorkspaceRepository) {
    this.repo = repo;
  }

  listGovernanceRoles() {
    return listGovernanceRolesOp();
  }

  listGovernancePermissionPoints() {
    return listGovernancePermissionPointsOp();
  }

  listAuditLogs(limit = 50) {
    return listAuditLogsOp(this.repo, limit);
  }

  listGovernanceCustomRoles() {
    return listGovernanceCustomRolesOp(this.repo);
  }

  upsertGovernanceCustomRole(input: { roleKey?: string; name: string; description: string; level: number; permissions: string[] }) {
    return upsertGovernanceCustomRoleOp(this.repo, input);
  }

  removeGovernanceCustomRole(roleKey: string) {
    return removeGovernanceCustomRoleOp(this.repo, roleKey);
  }

  resolveRolePermissions(roleKey: string) {
    return resolveRolePermissions(roleKey, this.listGovernanceRoles(), this.listGovernanceCustomRoles());
  }

  resolveWorkspaceRole(roleKey: string) {
    return resolveWorkspaceRole(roleKey, this.listGovernanceRoles(), this.listGovernanceCustomRoles());
  }

  listPlatformRoleBindings() {
    return listPlatformRoleBindingsOp(this.repo);
  }

  upsertPlatformRoleBinding(input: { userId: string; role: string }) {
    return upsertPlatformRoleBindingOp(this.repo, input);
  }

  removePlatformRoleBinding(userId: string) {
    return removePlatformRoleBindingOp(this.repo, userId);
  }

  listProjectRoleBindings(projectId: number) {
    return listProjectRoleBindingsOp(this.repo, projectId);
  }

  upsertProjectRoleBinding(input: { projectId: number; userId: string; role: "admin" | "member" | "viewer" }) {
    return upsertProjectRoleBindingOp(this.repo, input);
  }

  removeProjectRoleBinding(projectId: number, userId: string) {
    return removeProjectRoleBindingOp(this.repo, projectId, userId);
  }

  listProjectPolicies(projectId: number) {
    return listProjectPoliciesOp(this.repo, projectId);
  }

  listGlobalOrchestrationPolicies() {
    return listGlobalOrchestrationPoliciesOp(this.repo);
  }

  getActiveProjectPolicy(projectId: number) {
    return getActiveProjectPolicyOp(this.repo, projectId);
  }

  getActiveGlobalOrchestrationPolicy() {
    return getActiveGlobalOrchestrationPolicyOp(this.repo);
  }

  getEffectiveOrchestrationPolicy(projectId: number) {
    return getEffectiveOrchestrationPolicyForProjectOp(this.repo, projectId);
  }

  createProjectPolicyDraft(projectId: number, actor: string, strategy?: Record<string, unknown>) {
    return createProjectPolicyDraftOp(this.repo, {
      projectId,
      actor,
      strategy: strategy as never
    });
  }

  activateProjectPolicy(projectId: number, version: number, actor: string) {
    return activateProjectPolicyOp(this.repo, { projectId, version, actor });
  }

  createGlobalOrchestrationPolicyDraft(actor: string, strategy?: Record<string, unknown>) {
    return createGlobalOrchestrationPolicyDraftOp(this.repo, {
      actor,
      strategy: strategy as Parameters<typeof createGlobalOrchestrationPolicyDraftOp>[1]["strategy"]
    });
  }

  activateGlobalOrchestrationPolicy(version: number, actor: string) {
    return activateGlobalOrchestrationPolicyOp(this.repo, { version, actor });
  }

  restoreProjectOrchestrationPolicyToInitialMode(projectId: number, actor: string) {
    return restoreProjectOrchestrationPolicyToInitialModeOp(this.repo, { projectId, actor });
  }

  restoreGlobalOrchestrationPolicyToInitialMode(actor: string) {
    return restoreGlobalOrchestrationPolicyToInitialModeOp(this.repo, { actor });
  }

  upsertProjectWorkspaceBinding(input: {
    projectId: number;
    openclawProfile: string;
    agentId: string;
    workspacePath: string;
    runtimeMode: "openclaw-native" | "bridge";
    locked: boolean;
    createdBy: string;
  }) {
    return upsertProjectWorkspaceBindingOp(this.repo, input);
  }

  listPolicyExecutionLogs(iterationId: number) {
    return listPolicyExecutionLogsOp(this.repo, iterationId);
  }

  appendPolicyExecutionLog(input: {
    projectId: number;
    iterationId: number;
    policyVersion: number;
    stage: string;
    action: string;
    result: "success" | "blocked" | "error";
    evidence: string[];
  }) {
    return appendPolicyExecutionLogOp(this.repo, input);
  }

  evaluatePolicyGateForCoach(iterationId: number, message: string) {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const activePolicy = this.getEffectiveOrchestrationPolicy(iteration.projectId);
    return evaluatePolicyGateForCoachOp(this.repo, iteration, message, activePolicy);
  }
}
