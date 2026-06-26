import assert from "node:assert/strict";
import test from "node:test";
import { composeAssistantGlobalMessage, composeAssistantProjectMessage } from "../src/pages/layout/assistantPromptComposer.ts";

test("composeAssistantGlobalMessage uses native mode as plain text", () => {
  const prompt = composeAssistantGlobalMessage("  请帮我梳理当前阻断项  ", "native");
  assert.equal(prompt, "请帮我梳理当前阻断项");
});

test("composeAssistantGlobalMessage uses orchestration mode with governance prefix", () => {
  const prompt = composeAssistantGlobalMessage("统一门禁策略", "orchestration");
  assert.match(prompt, /\[业务助手主窗口编排约束\]/);
  assert.match(prompt, /skills 采用渐进式加载/);
  assert.doesNotMatch(prompt, /flow_route|skill-creator|default-orchestration/);
  assert.match(prompt, /用户请求：统一门禁策略/);
});

test("composeAssistantProjectMessage uses project orchestration prefix", () => {
  const prompt = composeAssistantProjectMessage("首版先确认Git分析报告", "orchestration");
  assert.match(prompt, /\[业务助手项目窗口策略约束\]/);
  assert.match(prompt, /由 Agent 根据问题自行编排/);
  assert.match(prompt, /用户请求：首版先确认Git分析报告/);
});
