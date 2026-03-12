import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  Iteration,
  PolicyExecutionLogRecord,
  ProjectPolicyRecord,
  ProjectRoleBindingRecord,
  ProjectWorkspaceBindingRecord
} from "../../domain/workspace/types";

export const GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID = 0;

function buildInitialOrchestrationStrategy(): ProjectPolicyRecord["strategy"] {
  return {
    stages: ["clarification", "scope", "development", "testing", "release", "archive"],
    gates: [
      {
        stage: "clarification",
        requiredArtifacts: ["analysis-report"],
        requireHumanConfirmation: true
      },
      {
        stage: "scope",
        requiredArtifacts: ["boundary-confirmation"],
        requireHumanConfirmation: true
      },
      {
        stage: "testing",
        requiredArtifacts: ["test-matrix", "acceptance-checklist"],
        requireHumanConfirmation: false
      },
      {
        stage: "release",
        requiredArtifacts: ["release-review"],
        requireHumanConfirmation: false
      }
    ],
    requiredConfirmations: {
      firstIterationGitReport: true
    },
    exceptions: [
      { key: "repo-sync-failed", fallbackAction: "request-user-decision", requireUserDecision: true },
      { key: "test-blocked", fallbackAction: "pause-release", requireUserDecision: true }
    ],
    skillsPlan: [
      { stage: "clarification", skills: ["00-orchestrator-sop", "01-ontology-mapping"] },
      { stage: "scope", skills: ["02-impact-analysis", "03-deliverable-governance"] },
      { stage: "development", skills: ["03-deliverable-governance"] },
      { stage: "testing", skills: ["06-quality-release-gate"] },
      { stage: "release", skills: ["06-quality-release-gate", "07-audit-trace"] },
      { stage: "archive", skills: ["07-audit-trace", "04-cross-iteration"] }
    ]
  };
}

function composeStrategy(strategy?: Partial<ProjectPolicyRecord["strategy"]>): ProjectPolicyRecord["strategy"] {
  const initial = buildInitialOrchestrationStrategy();
  return {
    stages: strategy?.stages && strategy.stages.length > 0 ? strategy.stages : initial.stages,
    gates: strategy?.gates && strategy.gates.length > 0 ? strategy.gates : initial.gates,
    requiredConfirmations: {
      firstIterationGitReport: strategy?.requiredConfirmations?.firstIterationGitReport !== false
    },
    exceptions: strategy?.exceptions && strategy.exceptions.length > 0 ? strategy.exceptions : initial.exceptions,
    skillsPlan: strategy?.skillsPlan && strategy.skillsPlan.length > 0 ? strategy.skillsPlan : initial.skillsPlan
  };
}

function nowIso() {
  return new Date().toISOString();
}

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
}

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

export function createProjectPolicyDraftOp(
  repo: WorkspaceRepository,
  input: {
    projectId: number;
    actor: string;
    strategy?: Partial<ProjectPolicyRecord["strategy"]>;
  }
) {
  const existing = repo.listProjectPolicies(input.projectId);
  const maxVersion = existing.length === 0 ? 0 : Math.max(...existing.map((item) => item.version));
  const now = nowIso();
  const record: ProjectPolicyRecord = {
    id: nextId(existing),
    projectId: input.projectId,
    version: maxVersion + 1,
    status: "draft",
    strategy: composeStrategy(input.strategy),
    createdBy: input.actor,
    approvedBy: "",
    createdAt: now,
    approvedAt: ""
  };
  repo.appendProjectPolicy(record);
  return record;
}

export function activateProjectPolicyOp(repo: WorkspaceRepository, input: { projectId: number; version: number; actor: string }) {
  const items = repo.listProjectPolicies(input.projectId);
  const now = nowIso();
  let activated: ProjectPolicyRecord | null = null;
  for (const item of items) {
    if (item.version === input.version) {
      const next: ProjectPolicyRecord = {
        ...item,
        status: "active",
        approvedBy: input.actor,
        approvedAt: now
      };
      repo.updateProjectPolicy(next);
      activated = next;
      continue;
    }
    if (item.status === "active") {
      repo.updateProjectPolicy({ ...item, status: "archived" });
    }
  }
  return activated;
}

export function createGlobalOrchestrationPolicyDraftOp(
  repo: WorkspaceRepository,
  input: { actor: string; strategy?: Partial<ProjectPolicyRecord["strategy"]> }
) {
  return createProjectPolicyDraftOp(repo, {
    projectId: GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID,
    actor: input.actor,
    strategy: input.strategy
  });
}

export function activateGlobalOrchestrationPolicyOp(
  repo: WorkspaceRepository,
  input: { version: number; actor: string }
) {
  return activateProjectPolicyOp(repo, {
    projectId: GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID,
    version: input.version,
    actor: input.actor
  });
}

export function restoreProjectOrchestrationPolicyToInitialModeOp(
  repo: WorkspaceRepository,
  input: { projectId: number; actor: string }
) {
  const draft = createProjectPolicyDraftOp(repo, {
    projectId: input.projectId,
    actor: input.actor,
    strategy: buildInitialOrchestrationStrategy()
  });
  return activateProjectPolicyOp(repo, {
    projectId: input.projectId,
    version: draft.version,
    actor: input.actor
  });
}

export function restoreGlobalOrchestrationPolicyToInitialModeOp(
  repo: WorkspaceRepository,
  input: { actor: string }
) {
  return restoreProjectOrchestrationPolicyToInitialModeOp(repo, {
    projectId: GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID,
    actor: input.actor
  });
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
    openclawProfile: input.openclawProfile,
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

export function listPlatformRoleBindingsOp(repo: WorkspaceRepository) {
  return repo.listPlatformRoleBindings();
}

export function upsertPlatformRoleBindingOp(
  repo: WorkspaceRepository,
  input: { userId: string; role: "admin" | "member" | "viewer" }
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

export function listPolicyExecutionLogsOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listPolicyExecutionLogs(iterationId);
}

export function appendPolicyExecutionLogOp(
  repo: WorkspaceRepository,
  input: Omit<PolicyExecutionLogRecord, "id" | "createdAt">
) {
  const current = repo.listPolicyExecutionLogs(input.iterationId);
  const record: PolicyExecutionLogRecord = {
    id: nextId(current),
    projectId: input.projectId,
    iterationId: input.iterationId,
    policyVersion: input.policyVersion,
    stage: input.stage,
    action: input.action,
    result: input.result,
    evidence: input.evidence,
    createdAt: nowIso()
  };
  repo.appendPolicyExecutionLog(record);
  return record;
}

function containsArtifactReference(iterationId: number, repo: WorkspaceRepository, keyword: string) {
  const messages = repo.listMessages(iterationId);
  return messages.some((item) => typeof item.content === "string" && item.content.includes(keyword));
}

export function evaluatePolicyGateForCoachOp(
  repo: WorkspaceRepository,
  iteration: Iteration,
  message: string,
  activePolicy: ProjectPolicyRecord | null
): {
  blocked: boolean;
  stage: string;
  reason: string;
  requiredActions: string[];
} {
  const lowered = message.toLowerCase();
  const stage =
    lowered.includes("发布") || lowered.includes("release")
      ? "release"
      : lowered.includes("测试") || lowered.includes("验收")
        ? "testing"
        : lowered.includes("范围") || lowered.includes("边界")
          ? "scope"
          : "clarification";

  if (!activePolicy) {
    return {
      blocked: false,
      stage,
      reason: "",
      requiredActions: []
    };
  }

  if (activePolicy.strategy.requiredConfirmations.firstIterationGitReport) {
    const firstIterationId =
      repo
        .listIterations(iteration.projectId)
        .sort((a, b) => a.id - b.id)[0]?.id || iteration.id;
    if (iteration.id === firstIterationId) {
      const hasGitConfirm = containsArtifactReference(iteration.id, repo, "Git分析报告") && containsArtifactReference(iteration.id, repo, "确认");
      if (!hasGitConfirm) {
        return {
          blocked: true,
          stage,
          reason: "首版需先完成 Git 分析报告确认",
          requiredActions: ["请先确认 Git 分析报告后再推进当前阶段"]
        };
      }
    }
  }

  return {
    blocked: false,
    stage,
    reason: "",
    requiredActions: []
  };
}
