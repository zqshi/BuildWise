import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalPolicyRecord, buildMinimalIteration } from "./helpers/mock-factories.mjs";

const { evaluatePolicyGateForCoachOp } = await import(
  "../dist/application/workspace/workspaceServicePolicyOps.js"
);

// ─── 无策略时不阻塞 ───

test("no active policy → not blocked", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, { id: 10 });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "让我们进入测试阶段", null);
  assert.equal(result.blocked, false);
});

// ─── firstIterationGitReport 兼容 ───

test("first iteration without git report → blocked", () => {
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
  assert.ok(result.reason.includes("Git"));
});

test("first iteration with git report confirmed → not blocked", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  repo._store.iterations.push(iter);
  repo._store.messages.push(
    { id: 1, iterationId: 10, role: "assistant", content: "Git分析报告已完成，analysis-report 结果如下", createdAt: new Date().toISOString() },
    { id: 2, iterationId: 10, role: "user", content: "确认通过", createdAt: new Date().toISOString() }
  );
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

// ─── gates requiredArtifacts 检查 ───

test("gate with requiredArtifacts blocks when artifact missing", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  repo._store.iterations.push(iter);
  // 不是首次迭代（有更早的迭代）
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

test("gate with requiredArtifacts passes when artifact present", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  repo._store.iterations.push(iter);
  repo._store.iterations.push(buildMinimalIteration(1, { id: 5 }));
  repo._store.messages.push(
    { id: 1, iterationId: 10, role: "assistant", content: "release-review 完成", createdAt: new Date().toISOString() }
  );
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

test("gate with requireHumanConfirmation blocks when no confirm found", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  repo._store.iterations.push(iter);
  repo._store.iterations.push(buildMinimalIteration(1, { id: 5 }));
  repo._store.messages.push(
    { id: 1, iterationId: 10, role: "assistant", content: "boundary-confirmation 已生成", createdAt: new Date().toISOString() }
  );
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

// ─── stage 推断 ───

test("infers release stage from message keywords", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, { id: 10 });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "准备发布了", null);
  assert.equal(result.stage, "release");
});

test("infers testing stage from message keywords", () => {
  const repo = createInMemoryWorkspaceRepo();
  const iter = buildMinimalIteration(1, { id: 10 });
  const result = evaluatePolicyGateForCoachOp(repo, iter, "开始验收测试", null);
  assert.equal(result.stage, "testing");
});
