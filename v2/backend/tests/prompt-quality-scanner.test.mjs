import { test } from "node:test";
import assert from "node:assert/strict";

import { scanUserPromptSchemaLeak } from "../scripts/check-prompt-quality.mjs";

const fixturePath = new URL("./fixtures/prompt-violation-sample.ts", import.meta.url).pathname;

test("scanUserPromptSchemaLeak 识别 userPrompt 中泄露的 JSON schema 字段名", () => {
  const violations = scanUserPromptSchemaLeak([fixturePath]);
  assert.ok(violations.length >= 1, "应识别违规 userPrompt（含 JSON schema 字段名）");
  const snippets = violations.map((v) => v.snippet).join("\n");
  assert.match(snippets, /uxConstraints/, "违规片段应含泄露的字段名");
});

test("scanUserPromptSchemaLeak 不误报纯自然语言 userPrompt", () => {
  const violations = scanUserPromptSchemaLeak([fixturePath]);
  const snippets = violations.map((v) => v.snippet).join("\n");
  assert.doesNotMatch(snippets, /请基于上述上下文/, "合规自然语言 userPrompt 不应被报");
});

test("scanUserPromptSchemaLeak 跳过函数动态构造的 userPrompt（仅扫字面量）", () => {
  const violations = scanUserPromptSchemaLeak([fixturePath]);
  const snippets = violations.map((v) => v.snippet).join("\n");
  assert.doesNotMatch(snippets, /buildDynamicUserPrompt/, "动态构造的 userPrompt 不应被误扫");
});
