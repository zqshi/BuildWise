import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  Iteration,
  PolicyExecutionLogRecord,
  ProjectPolicyRecord,
  ProjectRoleBindingRecord,
  TenantMemberBindingRecord,
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
      {
        stage: "agent-selected",
        skills: [
          "00-orchestrator-sop",
          "01-ontology-mapping",
          "02-impact-analysis",
          "03-deliverable-governance",
          "04-cross-iteration",
          "05-exception-recovery",
          "06-quality-release-gate",
          "07-audit-trace",
          "08-agentic-flow-contract",
          "09-deliverable-content-contract"
        ]
      }
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

// ---------------------------------------------------------------------------
// mergePolicyDeltaOp — 策略增量合并
// ---------------------------------------------------------------------------

type PolicyDeltaInput = {
  action: string;
  gate?: { stage: string; requiredArtifacts: string[]; requireHumanConfirmation: boolean };
  stage?: string;
  insertAfter?: string;
  skillsPlan?: Array<{ stage: string; skills: string[] }>;
};

function applyDeltaToStrategy(
  base: ProjectPolicyRecord["strategy"],
  delta: PolicyDeltaInput
): ProjectPolicyRecord["strategy"] {
  const result = {
    stages: [...base.stages],
    gates: base.gates.map((g) => ({ ...g })),
    requiredConfirmations: { ...base.requiredConfirmations },
    exceptions: base.exceptions.map((e) => ({ ...e })),
    skillsPlan: base.skillsPlan.map((s) => ({ ...s, skills: [...s.skills] })),
  };

  switch (delta.action) {
    case "add-stage": {
      if (delta.stage && !result.stages.includes(delta.stage)) {
        if (delta.insertAfter) {
          const idx = result.stages.indexOf(delta.insertAfter);
          if (idx >= 0) {
            result.stages.splice(idx + 1, 0, delta.stage);
          } else {
            result.stages.push(delta.stage);
          }
        } else {
          result.stages.push(delta.stage);
        }
      }
      break;
    }
    case "remove-stage": {
      if (delta.stage) {
        result.stages = result.stages.filter((s) => s !== delta.stage);
        result.gates = result.gates.filter((g) => g.stage !== delta.stage);
      }
      break;
    }
    case "add-gate": {
      if (delta.gate) {
        result.gates.push({ ...delta.gate });
      }
      break;
    }
    case "remove-gate": {
      if (delta.gate) {
        result.gates = result.gates.filter((g) => g.stage !== delta.gate?.stage);
      }
      break;
    }
    case "modify-gate": {
      if (delta.gate) {
        const idx = result.gates.findIndex((g) => g.stage === delta.gate?.stage);
        if (idx >= 0) {
          result.gates[idx] = { ...delta.gate };
        } else {
          result.gates.push({ ...delta.gate });
        }
      }
      break;
    }
    case "modify-skill-plan": {
      if (delta.skillsPlan) {
        result.skillsPlan = delta.skillsPlan.map((s) => ({ ...s, skills: [...s.skills] }));
      }
      break;
    }
  }

  return result;
}

export function mergePolicyDeltaOp(
  repo: WorkspaceRepository,
  input: {
    projectId: number;
    actor: string;
    delta: PolicyDeltaInput;
    evidence: string[];
  }
): { policy: ProjectPolicyRecord; action: "created" | "merged" } {
  const existing = repo.listProjectPolicies(input.projectId);
  const activePolicy = existing.filter((p) => p.status === "active").sort((a, b) => b.version - a.version)[0] || null;
  const maxVersion = existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.version));
  const now = nowIso();

  let baseStrategy: ProjectPolicyRecord["strategy"];
  let action: "created" | "merged";

  if (activePolicy) {
    baseStrategy = activePolicy.strategy;
    action = "merged";
    // 归档旧版本
    repo.updateProjectPolicy({ ...activePolicy, status: "archived" });
  } else {
    baseStrategy = buildInitialOrchestrationStrategy();
    action = "created";
  }

  const newStrategy = applyDeltaToStrategy(baseStrategy, input.delta);

  const newPolicy: ProjectPolicyRecord = {
    id: nextId(existing),
    projectId: input.projectId,
    version: maxVersion + 1,
    status: "active",
    strategy: newStrategy,
    createdBy: input.actor,
    approvedBy: input.actor,
    createdAt: now,
    approvedAt: now,
  };
  repo.appendProjectPolicy(newPolicy);

  return { policy: newPolicy, action };
}

// ---------------------------------------------------------------------------
// Artifact status helpers for structured gate evaluation
// ---------------------------------------------------------------------------

function hasArtifactReady(iteration: Iteration, artifactId: string): boolean {
  const items = iteration.changeControl?.artifactWorkflow?.items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => item.id === artifactId && (item.status === "ready" || item.status === "partial"));
}

function hasHumanConfirmationForStage(iteration: Iteration, stage: string): boolean {
  const items = iteration.changeControl?.artifactWorkflow?.items;
  if (!Array.isArray(items)) return false;
  return items
    .filter((item) => item.stage === stage)
    .some((item) => item.lastConfirmedAt !== "" && item.lastConfirmedBy !== "");
}

export function evaluatePolicyGateForCoachOp(
  repo: WorkspaceRepository,
  iteration: Iteration,
  _message: string,
  activePolicy: ProjectPolicyRecord | null
): {
  blocked: boolean;
  stage: string;
  reason: string;
  requiredActions: string[];
} {
  // Stage 从结构化状态读取，不从消息关键词猜测
  const stage = iteration.changeControl?.artifactWorkflow?.activeStage || "clarification";

  if (!activePolicy) {
    return { blocked: false, stage, reason: "", requiredActions: [] };
  }

  // ── firstIterationGitReport 兼容检查 ──
  if (activePolicy.strategy.requiredConfirmations.firstIterationGitReport) {
    const firstIterationId =
      repo
        .listIterations(iteration.projectId)
        .sort((a, b) => a.id - b.id)[0]?.id || iteration.id;
    if (iteration.id === firstIterationId) {
      // 检查分析状态：confirmedBy 非空表示已确认分析报告
      const hasConfirmed = iteration.changeControl?.confirmedBy !== "" && iteration.changeControl?.confirmedBy != null;
      if (!hasConfirmed) {
        return {
          blocked: true,
          stage,
          reason: "首版需先完成分析报告确认",
          requiredActions: ["请先确认分析报告后再推进当前阶段"]
        };
      }
    }
  }

  // ── 遍历 gates 检查 requiredArtifacts + requireHumanConfirmation ──
  const matchedGates = activePolicy.strategy.gates.filter((g) => g.stage === stage);
  for (const gate of matchedGates) {
    // 检查 requiredArtifacts — 基于 artifactWorkflow 结构化状态
    const missingArtifacts = gate.requiredArtifacts.filter(
      (artifact) => !hasArtifactReady(iteration, artifact)
    );
    if (missingArtifacts.length > 0) {
      return {
        blocked: true,
        stage,
        reason: `阶段 ${stage} 缺少必要制品: ${missingArtifacts.join(", ")}`,
        requiredActions: missingArtifacts.map((a) => `请先完成 ${a}`)
      };
    }

    // 检查 requireHumanConfirmation — 基于 artifact 确认状态
    if (gate.requireHumanConfirmation) {
      if (!hasHumanConfirmationForStage(iteration, stage)) {
        return {
          blocked: true,
          stage,
          reason: `阶段 ${stage} 需要人工确认后才能推进`,
          requiredActions: [`请确认 ${stage} 阶段的相关制品后再继续`]
        };
      }
    }
  }

  return { blocked: false, stage, reason: "", requiredActions: [] };
}
