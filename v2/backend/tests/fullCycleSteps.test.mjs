import test from "node:test";
import assert from "node:assert/strict";

const { executeStep } = await import("../dist/application/workspace/quality/fullCycleSteps.js");

function stepState() {
  return { status: "pending", note: "", completedAt: "", failedAt: "", missingPreconditions: [], retryable: false };
}

function emptyCheckpoint() {
  return {
    startedAt: "t1", lastUpdatedAt: "t1", currentStep: null, resumable: false, completedAt: "",
    steps: {
      "analysis": stepState(), "confirmation": stepState(), "ux-guidance": stepState(),
      "frontend-rewrite": stepState(), "backend-rewrite": stepState(), "merge-rewrite": stepState(),
      "test-artifacts": stepState(), "release-review": stepState(), "delivery-package": stepState(),
      "publish": stepState(),
    },
  };
}

function rewriteResult(appliedFiles, summary) {
  return {
    iterationId: 1, dryRun: false, summary, warnings: [],
    appliedFiles, skippedFiles: [], outOfBoundaryFiles: [], rolledBackFiles: [], edits: [],
  };
}

function emptyResults() {
  return {
    analysisReport: null, rewriteResult: null, testArtifactsResult: null,
    releaseReview: null, deliveryPackageResult: null, publishResult: null,
    rewriteRuns: [],
  };
}

// ─── T1：merge-rewrite 必须合并两次改写结果，而非传字面空数组 ───

test("merge-rewrite 步骤合并前端与后端改写结果，appliedFiles 不再为空", async () => {
  const checkpoint = emptyCheckpoint();
  const results = emptyResults();
  results.rewriteRuns = [
    { label: "前端", result: rewriteResult(["a.ts", "c.ts"], "前端改写完成") },
    { label: "后端", result: rewriteResult(["b.ts"], "后端改写完成") },
  ];
  const params = { iterationId: 1 };
  const input = { rewriteDryRun: false };

  await executeStep("merge-rewrite", params, input, checkpoint, results, [], [], null);

  assert.ok(results.rewriteResult, "应产出合并后的 rewriteResult");
  assert.ok(results.rewriteResult.appliedFiles.includes("a.ts"), "应含前端改写文件");
  assert.ok(results.rewriteResult.appliedFiles.includes("b.ts"), "应含后端改写文件");
  assert.ok(
    !results.rewriteResult.summary.includes("未执行改写"),
    "summary 不应是空转占位文案"
  );
  assert.equal(checkpoint.steps["merge-rewrite"].note, "改写结果已合并。");
});

test("merge-rewrite 在两次改写均失败（result 为 null）时回退为空响应", async () => {
  const checkpoint = emptyCheckpoint();
  const results = emptyResults();
  results.rewriteRuns = [
    { label: "前端", result: null },
    { label: "后端", result: null },
  ];
  const params = { iterationId: 1 };
  const input = { rewriteDryRun: false };

  await executeStep("merge-rewrite", params, input, checkpoint, results, [], [], null);

  assert.ok(results.rewriteResult, "仍应产出空响应对象");
  assert.equal(results.rewriteResult.appliedFiles.length, 0, "无有效结果时 appliedFiles 为空");
});

// ─── T1：executeStepRewrite 必须把每次改写结果收集进 rewriteRuns ───

test("frontend-rewrite 与 backend-rewrite 步骤把改写结果收集进 rewriteRuns", async () => {
  const checkpoint = emptyCheckpoint();
  const results = emptyResults();
  const calls = [];
  const params = {
    repo: { findIteration: () => null },
    iterationId: 1,
    rewriteCodeInBoundary: async (_id, rewriteInput) => {
      calls.push(rewriteInput.role);
      return rewriteInput.role === "frontend-developer"
        ? rewriteResult(["a.ts"], "前端改写完成")
        : rewriteResult(["b.ts"], "后端改写完成");
    },
  };
  const input = { rewriteInstruction: "实现需求 X" };

  await executeStep("frontend-rewrite", params, input, checkpoint, results, [], [], null);
  await executeStep("backend-rewrite", params, input, checkpoint, results, [], [], null);

  assert.equal(results.rewriteRuns.length, 2, "两次改写都应被收集");
  assert.equal(results.rewriteRuns[0].label, "前端");
  assert.deepEqual(results.rewriteRuns[0].result.appliedFiles, ["a.ts"]);
  assert.equal(results.rewriteRuns[1].label, "后端");
  assert.deepEqual(results.rewriteRuns[1].result.appliedFiles, ["b.ts"]);
});

// ─── T3：autoResolve 默认守澄清门禁，显式 true 才放行 ───

test("confirmation 步骤在存在未收敛澄清问题且未显式 autoResolve 时阻断", async () => {
  const clarificationQuestions = ["需求范围是否含管理后台？", "是否需要权限模型？"];
  const repo = {
    findIteration: () => ({ id: 1, changeControl: { clarificationQuestions, lastAnalysisAt: "t1" } }),
  };
  const params = {
    repo, iterationId: 1,
    confirmIterationAnalysis: (_id, ci) => {
      const resolved = ci.resolvedClarificationQuestions || [];
      const unresolved = clarificationQuestions.filter((q) => !resolved.includes(q));
      return unresolved.length > 0
        ? { ok: false, reason: "clarification_questions_unresolved", unresolvedQuestions: unresolved }
        : { ok: true };
    },
  };
  const checkpoint = emptyCheckpoint();
  const results = emptyResults();
  const blockers = [];
  const input = {}; // 未显式 autoResolveClarifications → 默认守门禁

  await executeStep("confirmation", params, input, checkpoint, results, blockers, [], null);

  assert.equal(checkpoint.steps["confirmation"].status, "blocked", "应被澄清门禁阻断");
  assert.ok(blockers.length > 0, "未收敛问题应进入 blockers");
});

test("confirmation 步骤在显式 autoResolveClarifications=true 时放行（保留开关）", async () => {
  const clarificationQuestions = ["需求范围是否含管理后台？"];
  const repo = {
    findIteration: () => ({ id: 1, changeControl: { clarificationQuestions, lastAnalysisAt: "t1" } }),
  };
  const params = {
    repo, iterationId: 1,
    confirmIterationAnalysis: (_id, ci) => {
      const resolved = ci.resolvedClarificationQuestions || [];
      const unresolved = clarificationQuestions.filter((q) => !resolved.includes(q));
      return unresolved.length > 0
        ? { ok: false, reason: "clarification_questions_unresolved", unresolvedQuestions: unresolved }
        : { ok: true };
    },
  };
  const checkpoint = emptyCheckpoint();
  const results = emptyResults();
  const blockers = [];
  const input = { autoResolveClarifications: true }; // 显式放行

  await executeStep("confirmation", params, input, checkpoint, results, blockers, [], null);

  assert.notEqual(checkpoint.steps["confirmation"].status, "blocked", "显式放行不应阻断");
});
