import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIterationMessageContent } from "../backend/src/application/workspace/workspaceMessageSanitizer.ts";

test("normalizeIterationMessageContent rewrites user artifact references into plain prompts", () => {
  const normalized = normalizeIterationMessageContent(
    "user",
    ["【交付物引用】设计规范", "摘要：覆盖布局与状态规则", "关注点：design-spec", "请围绕交付物「design-spec」继续与用户确认，不要直接跨阶段推进。"].join("\n")
  );

  assert.equal(normalized, "请围绕交付物「design-spec」继续与我确认。");
});

