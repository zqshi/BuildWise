import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalPolicyRecord } from "./helpers/mock-factories.mjs";

const { mergePolicyDeltaOp, getActiveProjectPolicyOp } = await import(
  "../dist/application/workspace/governance/policyOps.js"
);

// ─── 无活跃策略时创建新版本 ───

test("creates new active policy when no active policy exists", () => {
  const repo = createInMemoryWorkspaceRepo();
  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "system",
    delta: { action: "add-stage", stage: "prototype", insertAfter: "clarification" },
    evidence: ["用户要求添加原型阶段"]
  });
  assert.equal(result.action, "created");
  assert.equal(result.policy.status, "active");
  assert.ok(result.policy.strategy.stages.includes("prototype"));
});

// ─── add-stage 插入正确位置 ───

test("add-stage inserts after specified stage", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, {
    id: 1,
    strategy: {
      stages: ["clarification", "scope", "development", "testing", "release", "archive"],
      gates: [],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: { action: "add-stage", stage: "prototype", insertAfter: "clarification" },
    evidence: []
  });
  assert.equal(result.action, "merged");
  const stages = result.policy.strategy.stages;
  assert.equal(stages.indexOf("prototype"), stages.indexOf("clarification") + 1);
});

// ─── remove-stage ───

test("remove-stage removes target stage", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, {
    id: 1,
    strategy: {
      stages: ["clarification", "prototype", "scope", "development", "testing", "release", "archive"],
      gates: [],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: { action: "remove-stage", stage: "prototype" },
    evidence: ["跳过原型"]
  });
  assert.ok(!result.policy.strategy.stages.includes("prototype"));
});

// ─── add-gate ───

test("add-gate appends new gate", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, {
    id: 1,
    strategy: {
      stages: ["clarification", "scope"],
      gates: [],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: {
      action: "add-gate",
      gate: { stage: "scope", requiredArtifacts: ["design-review"], requireHumanConfirmation: true }
    },
    evidence: []
  });
  const gate = result.policy.strategy.gates.find((g) => g.stage === "scope");
  assert.ok(gate);
  assert.deepEqual(gate.requiredArtifacts, ["design-review"]);
});

// ─── modify-gate ───

test("modify-gate replaces existing gate for same stage", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, {
    id: 1,
    strategy: {
      stages: ["clarification", "testing"],
      gates: [{ stage: "testing", requiredArtifacts: ["test-matrix"], requireHumanConfirmation: false }],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: {
      action: "modify-gate",
      gate: { stage: "testing", requiredArtifacts: ["test-matrix", "acceptance-checklist"], requireHumanConfirmation: true }
    },
    evidence: []
  });
  const gate = result.policy.strategy.gates.find((g) => g.stage === "testing");
  assert.equal(gate.requireHumanConfirmation, true);
  assert.equal(gate.requiredArtifacts.length, 2);
});

// ─── modify-skill-plan ───

test("modify-skill-plan replaces skills plan", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, {
    id: 1,
    strategy: {
      stages: ["clarification"],
      gates: [],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: [{ stage: "agent-selected", skills: ["00-orchestrator-sop"] }]
    }
  });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: {
      action: "modify-skill-plan",
      skillsPlan: [{ stage: "development", skills: ["01-ontology-mapping", "02-impact-analysis"] }]
    },
    evidence: []
  });
  assert.equal(result.policy.strategy.skillsPlan.length, 1);
  assert.equal(result.policy.strategy.skillsPlan[0].stage, "development");
});

// ─── 版本递增 ───

test("merged policy has incremented version", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, { id: 1, version: 3 });
  repo.appendProjectPolicy(seed);

  const result = mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: { action: "remove-stage", stage: "archive" },
    evidence: []
  });
  assert.equal(result.policy.version, 4);
});

// ─── 旧版本归档 ───

test("previous active policy is archived after merge", () => {
  const repo = createInMemoryWorkspaceRepo();
  const seed = buildMinimalPolicyRecord(0, { id: 1, version: 1 });
  repo.appendProjectPolicy(seed);

  mergePolicyDeltaOp(repo, {
    projectId: 0,
    actor: "user",
    delta: { action: "remove-stage", stage: "archive" },
    evidence: []
  });

  const policies = repo._store.projectPolicies.filter((p) => p.projectId === 0);
  const archived = policies.filter((p) => p.status === "archived");
  const active = policies.filter((p) => p.status === "active");
  assert.equal(archived.length, 1);
  assert.equal(active.length, 1);
  assert.equal(active[0].version, 2);
});
