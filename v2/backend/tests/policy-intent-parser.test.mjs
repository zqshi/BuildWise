import test from "node:test";
import assert from "node:assert/strict";

const { parsePolicyIntentFromReply } = await import(
  "../dist/application/globalAssistant/policyIntentParser.js"
);

// ─── 无策略变更 ───

test("returns no-policy-change when reply has no policy marker", () => {
  const result = parsePolicyIntentFromReply("这个项目看起来不错，继续推进就好。", []);
  assert.equal(result.type, "no-policy-change");
  assert.equal(result.delta, null);
});

test("returns no-policy-change for empty reply", () => {
  const result = parsePolicyIntentFromReply("", []);
  assert.equal(result.type, "no-policy-change");
});

// ─── 添加门禁 ───

test("parses add-gate intent from policy marker", () => {
  const reply = [
    "好的，我帮你在 scope 阶段加一个门禁。",
    '<!-- policy:{"action":"add-gate","gate":{"stage":"scope","requiredArtifacts":["design-review"],"requireHumanConfirmation":true}} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "add-gate");
  assert.deepEqual(result.delta.gate.stage, "scope");
  assert.deepEqual(result.delta.gate.requiredArtifacts, ["design-review"]);
  assert.equal(result.delta.gate.requireHumanConfirmation, true);
});

// ─── 移除阶段 ───

test("parses remove-stage intent", () => {
  const reply = [
    "没问题，跳过原型阶段。",
    '<!-- policy:{"action":"remove-stage","stage":"prototype"} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "remove-stage");
  assert.equal(result.delta.stage, "prototype");
});

// ─── 修改技能计划 ───

test("parses modify-skill-plan intent", () => {
  const reply = [
    "调整一下技能计划。",
    '<!-- policy:{"action":"modify-skill-plan","skillsPlan":[{"stage":"development","skills":["01-ontology-mapping","02-impact-analysis"]}]} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "modify-skill-plan");
  assert.equal(result.delta.skillsPlan.length, 1);
  assert.equal(result.delta.skillsPlan[0].stage, "development");
});

// ─── 修改门禁 ───

test("parses modify-gate intent", () => {
  const reply = [
    "把 testing 阶段改成需要人工确认。",
    '<!-- policy:{"action":"modify-gate","gate":{"stage":"testing","requiredArtifacts":["test-matrix"],"requireHumanConfirmation":true}} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "modify-gate");
  assert.deepEqual(result.delta.gate.stage, "testing");
});

// ─── 添加阶段 ───

test("parses add-stage intent", () => {
  const reply = [
    "加一个 prototype 阶段。",
    '<!-- policy:{"action":"add-stage","stage":"prototype","insertAfter":"clarification"} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "add-stage");
  assert.equal(result.delta.stage, "prototype");
  assert.equal(result.delta.insertAfter, "clarification");
});

// ─── 边界情况 ───

test("handles malformed JSON in policy marker gracefully", () => {
  const reply = "出错了 <!-- policy:{broken json} -->";
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "no-policy-change");
  assert.ok(result.parseError);
});

test("extracts only the first policy marker if multiple exist", () => {
  const reply = [
    '<!-- policy:{"action":"remove-stage","stage":"prototype"} -->',
    "中间文字",
    '<!-- policy:{"action":"add-gate","gate":{"stage":"scope","requiredArtifacts":[],"requireHumanConfirmation":false}} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "remove-stage");
});

test("preserves evidence from reply text", () => {
  const reply = [
    "我建议跳过原型阶段，因为你们已经有现成的设计稿了。",
    '<!-- policy:{"action":"remove-stage","stage":"prototype"} -->'
  ].join("\n");
  const result = parsePolicyIntentFromReply(reply, []);
  assert.equal(result.type, "remove-stage");
  assert.ok(result.evidence.length > 0);
});
