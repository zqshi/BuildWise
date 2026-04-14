import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalPolicyRecord, buildMinimalIteration } from "./helpers/mock-factories.mjs";

const { evaluatePolicyGateForCoachOp } = await import(
  "../dist/application/workspace/governance/policyOps.js"
);

// ─── 无策略时不阻塞 ───

test("no active policy → not blocked", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, { id: 10 });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "让我们进入测试阶段", null);
  assert.equal(result.blocked, false);
});

// ─── firstIterationGitReport 兼容 ───

test("first iteration without confirmedBy → blocked", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  repo._store.iterations.push(iter);
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification", "scope"],
      gates: [{ stage: "clarification", requiredArtifacts: ["analysis-report"], requireHumanConfirmation: true }],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "继续", policy);
  assert.equal(result.blocked, true);
});

test("first iteration with confirmedBy set → not blocked by git report check", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "test-user",
      confirmedAt: new Date().toISOString(),
      artifactWorkflow: {
        activeStage: "clarification",
        items: [
          { id: "analysis-report", stage: "clarification", status: "ready", lastConfirmedAt: new Date().toISOString(), lastConfirmedBy: "test-user" }
        ]
      }
    }
  });
  repo._store.iterations.push(iter);
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification"],
      gates: [{ stage: "clarification", requiredArtifacts: ["analysis-report"], requireHumanConfirmation: true }],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: []
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "继续", policy);
  assert.equal(result.blocked, false);
});

// ─── gates requiredArtifacts 检查（基于 artifactWorkflow 结构化状态） ───

test("gate with requiredArtifacts blocks when artifact missing from workflow", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "user",
      artifactWorkflow: {
        activeStage: "release",
        items: []  // release-review 不存在
      }
    }
  });
  repo._store.iterations.push(iter);
  repo._store.iterations.push(buildMinimalIteration(1, { id: 5 }));
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification", "scope", "testing", "release"],
      gates: [
        { stage: "release", requiredArtifacts: ["release-review"], requireHumanConfirmation: false }
      ],
      requiredConfirmations: { firstIterationGitReport: false },
      exceptions: [],
      skillsPlan: []
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "准备发布 release", policy);
  assert.equal(result.blocked, true);
  assert.ok(result.reason.includes("release-review"));
});

test("gate with requiredArtifacts passes when artifact ready in workflow", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "user",
      artifactWorkflow: {
        activeStage: "release",
        items: [
          { id: "release-review", stage: "release", status: "ready", lastConfirmedAt: "", lastConfirmedBy: "" }
        ]
      }
    }
  });
  repo._store.iterations.push(iter);
  repo._store.iterations.push(buildMinimalIteration(1, { id: 5 }));
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification", "release"],
      gates: [
        { stage: "release", requiredArtifacts: ["release-review"], requireHumanConfirmation: false }
      ],
      requiredConfirmations: { firstIterationGitReport: false },
      exceptions: [],
      skillsPlan: []
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "发布", policy);
  assert.equal(result.blocked, false);
});

// ─── requireHumanConfirmation 检查 ───

test("gate with requireHumanConfirmation blocks when no confirm on artifact", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "user",
      artifactWorkflow: {
        activeStage: "scope",
        items: [
          { id: "boundary-confirmation", stage: "scope", status: "ready", lastConfirmedAt: "", lastConfirmedBy: "" }
        ]
      }
    }
  });
  repo._store.iterations.push(iter);
  repo._store.iterations.push(buildMinimalIteration(1, { id: 5 }));
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification", "scope"],
      gates: [
        { stage: "scope", requiredArtifacts: ["boundary-confirmation"], requireHumanConfirmation: true }
      ],
      requiredConfirmations: { firstIterationGitReport: false },
      exceptions: [],
      skillsPlan: []
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "确定范围 scope", policy);
  assert.equal(result.blocked, true);
  assert.ok(result.reason.includes("人工确认"));
});

// ─── stage 从结构化状态读取 ───

test("stage reads from artifactWorkflow.activeStage, not message keywords", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      artifactWorkflow: { activeStage: "release", items: [] }
    }
  });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "随便什么消息", null);
  assert.equal(result.stage, "release");
});

test("stage defaults to clarification when no activeStage set", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, { id: 10 });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "开始验收测试", null);
  assert.equal(result.stage, "clarification");
});
