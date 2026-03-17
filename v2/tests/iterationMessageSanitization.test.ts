import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeIterationMessageContent } from "../backend/src/application/workspace/workspaceMessageSanitizer.ts";

const flowOpsPath = new URL("../backend/src/application/workspace/workspaceServiceIterationFlowOps.ts", import.meta.url);
const coachOpsPath = new URL("../backend/src/application/workspace/workspaceServiceCoachOps.ts", import.meta.url);

test("normalizeIterationMessageContent rewrites user artifact references into plain prompts", () => {
  const normalized = normalizeIterationMessageContent(
    "user",
    ["【交付物引用】设计规范", "摘要：覆盖布局与状态规则", "关注点：design-spec", "请围绕交付物「design-spec」继续与用户确认，不要直接跨阶段推进。"].join("\n")
  );

  assert.equal(normalized, "请围绕交付物「design-spec」继续与我确认。");
});

test("createMessageOp routes persisted user messages through the message sanitizer", () => {
  const source = readFileSync(flowOpsPath, "utf8");

  assert.match(source, /import \{ normalizeIterationMessageContent \} from "\.\/workspaceMessageSanitizer";/);
  assert.match(source, /const normalizedContent = normalizeIterationMessageContent\(role, content\);/);
  assert.match(source, /repo\.createMessage\(iterationId, role, normalizedContent\)/);
});

test("coach conversation context sanitizes historical user artifact echoes before prompting llm", () => {
  const source = readFileSync(coachOpsPath, "utf8");

  assert.match(source, /import \{ normalizeIterationMessageContent \} from "\.\/workspaceMessageSanitizer";/);
  assert.match(source, /content: normalizeIterationMessageContent\(item\.role, item\.content\)/);
});
