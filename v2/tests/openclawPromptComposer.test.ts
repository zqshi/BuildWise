import assert from "node:assert/strict";
import test from "node:test";
import { composeOpenclawGlobalMessage, composeOpenclawProjectMessage } from "../src/pages/layout/openclawPromptComposer.ts";

test("composeOpenclawGlobalMessage uses native mode as plain text", () => {
  const prompt = composeOpenclawGlobalMessage("  请帮我梳理当前阻断项  ", "native");
  assert.equal(prompt, "请帮我梳理当前阻断项");
});

test("composeOpenclawGlobalMessage uses orchestration mode with governance prefix", () => {
  const prompt = composeOpenclawGlobalMessage("统一门禁策略", "orchestration");
  assert.match(prompt, /\[OpenClaw 主窗口编排约束\]/);
  assert.match(prompt, /skills 采用渐进式加载/);
  assert.doesNotMatch(prompt, /flow_route|skill-creator|default-orchestration/);
  assert.match(prompt, /用户请求：统一门禁策略/);
});

test("composeOpenclawProjectMessage uses project orchestration prefix", () => {
  const prompt = composeOpenclawProjectMessage("首版先确认Git分析报告", "orchestration");
  assert.match(prompt, /\[OpenClaw 项目窗口策略约束\]/);
  assert.match(prompt, /由 Agent 根据问题自行编排/);
  assert.match(prompt, /用户请求：首版先确认Git分析报告/);
});
