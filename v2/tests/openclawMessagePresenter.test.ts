import assert from "node:assert/strict";
import test from "node:test";
import { presentOpenclawMessage } from "../src/pages/layout/openclawMessagePresenter.ts";

test("presentOpenclawMessage keeps plain text response unchanged", () => {
  const presented = presentOpenclawMessage("同步重试成功，继续推进。");
  assert.equal(presented.kind, "plain");
  if (presented.kind === "plain") {
    assert.equal(presented.text, "同步重试成功，继续推进。");
  }
});

test("presentOpenclawMessage converts skill-contract json into structured message", () => {
  const raw = JSON.stringify({
    status: "need_user_input",
    summary: "检测到同步异常，建议先修权限再重试。",
    questions: ["请选择恢复方案 A 或 B。"],
    next_actions: ["方案A：修复权限后重试同步", "方案B：切换只读模式继续分析"],
    risks: ["若继续失败，发布将被阻断。"],
    evidence: ["sync_status=permission_denied"]
  });
  const presented = presentOpenclawMessage(raw);
  assert.equal(presented.kind, "structured");
  if (presented.kind === "structured") {
    assert.equal(presented.data.status, "need_user_input");
    assert.equal(presented.data.summary, "检测到同步异常，建议先修权限再重试。");
    assert.deepEqual(presented.data.questions, ["请选择恢复方案 A 或 B。"]);
    assert.deepEqual(presented.data.nextActions, ["方案A：修复权限后重试同步", "方案B：切换只读模式继续分析"]);
    assert.deepEqual(presented.data.risks, ["若继续失败，发布将被阻断。"]);
    assert.deepEqual(presented.data.evidence, ["sync_status=permission_denied"]);
  }
});
