import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';
import type { ProjectPolicyRecord } from '../../../domain/workspace/types';

const GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID = 0;

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
          "01-intake-requirements",
          "02-analyze-materials",
          "03-ontology-extraction",
          "04-ontology-collision",
          "05-clarify-scope",
          "06-model-snapshot-publish",
          "07-impact-analysis",
          "08-lock-boundary",
          "09-generate-prd"
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

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
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

// ── Policy delta merge ──

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
