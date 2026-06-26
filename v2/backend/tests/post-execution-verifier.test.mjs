import test from "node:test";
import assert from "node:assert/strict";

const {
  shouldBlockStageAdvance,
  shouldBlockArtifactSynthesis,
  sanitizeAction,
  sanitizeIntent,
  detectGateBypass,
  verifyCoachExecution,
} = await import("../dist/application/workspace/coach/postExecutionVerifier.js");

// ─── 硬阻断判断 ───

test("shouldBlockStageAdvance: stage gate 阻断 → true", () => {
  assert.equal(shouldBlockStageAdvance({ blocked: true }, null), true);
});

test("shouldBlockStageAdvance: policy gate 阻断 → true（核心：原软提示现硬阻断）", () => {
  assert.equal(shouldBlockStageAdvance({ blocked: false }, { blocked: true, reason: "需人工确认", requiredActions: [] }), true);
});

test("shouldBlockStageAdvance: 两个 gate 都不阻断 → false", () => {
  assert.equal(shouldBlockStageAdvance({ blocked: false }, null), false);
  assert.equal(shouldBlockStageAdvance({ blocked: false }, { blocked: false, reason: "", requiredActions: [] }), false);
});

test("shouldBlockArtifactSynthesis 与阶段推进同条件", () => {
  assert.equal(shouldBlockArtifactSynthesis({ blocked: false }, { blocked: true, reason: "", requiredActions: [] }), true);
  assert.equal(shouldBlockArtifactSynthesis({ blocked: false }, null), false);
});

// ─── action/intent 白名单 ───

test("sanitizeAction: 合法 action 保留", () => {
  assert.equal(sanitizeAction("rewrite"), "rewrite");
  assert.equal(sanitizeAction("run-full-cycle"), "run-full-cycle");
  assert.equal(sanitizeAction("none"), "none");
});

test("sanitizeAction: 非法 action 降级为 none", () => {
  assert.equal(sanitizeAction("delete-everything"), "none");
  assert.equal(sanitizeAction(""), "none");
  assert.equal(sanitizeAction(null), "none");
  assert.equal(sanitizeAction(123), "none");
});

test("sanitizeIntent: 合法 intent 保留", () => {
  assert.equal(sanitizeIntent("clarify"), "clarify");
  assert.equal(sanitizeIntent("full-cycle"), "full-cycle");
});

test("sanitizeIntent: 非法 intent 降级为 general", () => {
  assert.equal(sanitizeIntent("hack-the-system"), "general");
  assert.equal(sanitizeIntent(undefined), "general");
});

// ─── 门禁绕过检测 ───

test("detectGateBypass: policyGate 阻断 + LLM 声明推进类 action → true", () => {
  const blockedGate = { blocked: true, reason: "需人工确认", requiredActions: [] };
  assert.equal(detectGateBypass(blockedGate, "rewrite"), true);
  assert.equal(detectGateBypass(blockedGate, "run-full-cycle"), true);
  assert.equal(detectGateBypass(blockedGate, "enter-clarify-mode"), true);
});

test("detectGateBypass: policyGate 阻断 + LLM 声明 none/capture-business-rule → false（非推进类）", () => {
  const blockedGate = { blocked: true, reason: "需人工确认", requiredActions: [] };
  assert.equal(detectGateBypass(blockedGate, "none"), false);
  assert.equal(detectGateBypass(blockedGate, "capture-business-rule"), false);
});

test("detectGateBypass: policyGate 未阻断 → 始终 false", () => {
  assert.equal(detectGateBypass(null, "rewrite"), false);
  assert.equal(detectGateBypass({ blocked: false, reason: "", requiredActions: [] }, "run-full-cycle"), false);
});

// ─── 统一入口 verifyCoachExecution ───

test("verifyCoachExecution: policyGate 阻断 + LLM 声明 rewrite → blocked=true + bypassAttempt=true", () => {
  const result = verifyCoachExecution({
    gateResult: { blocked: false },
    policyGate: { blocked: true, reason: "需人工确认", requiredActions: ["请先确认"] },
    rawAction: "rewrite",
    rawIntent: "clarify",
  });
  assert.equal(result.blocked, true);
  assert.equal(result.action, "rewrite");
  assert.equal(result.intent, "clarify");
  assert.equal(result.bypassAttempt, true);
});

test("verifyCoachExecution: 无阻断 + 合法 action → blocked=false + bypassAttempt=false", () => {
  const result = verifyCoachExecution({
    gateResult: { blocked: false },
    policyGate: null,
    rawAction: "run-full-cycle",
    rawIntent: "full-cycle",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.action, "run-full-cycle");
  assert.equal(result.bypassAttempt, false);
});

test("verifyCoachExecution: 非法 action/intent 降级", () => {
  const result = verifyCoachExecution({
    gateResult: { blocked: false },
    policyGate: null,
    rawAction: "invalid-action",
    rawIntent: "invalid-intent",
  });
  assert.equal(result.action, "none");
  assert.equal(result.intent, "general");
});
