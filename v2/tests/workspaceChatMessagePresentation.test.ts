import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildIterationChatDisplayItems,
  hasAssistantImpactAssessment,
  normalizeUserChatInput,
  parseArtifactReferenceMessage
} from "../src/app/workspaceChatMessagePresentation.ts";

test("parseArtifactReferenceMessage extracts title summary evidence and prompt", () => {
  const parsed = parseArtifactReferenceMessage(
    ["【交付物引用】测试矩阵", "摘要：覆盖核心生成路径", "关注点：P0 必过；回归路径", "请查看交付物并确认。"].join("\n")
  );
  assert.deepEqual(parsed, {
    title: "测试矩阵",
    summary: "覆盖核心生成路径",
    evidence: ["P0 必过", "回归路径"],
    prompt: "请查看交付物并确认。"
  });
});

test("buildIterationChatDisplayItems merges adjacent assistant text and artifact card", () => {
  const items = buildIterationChatDisplayItems([
    { id: 1, iterationId: 1, role: "assistant", content: "已生成测试矩阵，请先阅读关键覆盖点。", createdAt: "2026-03-16T10:00:00.000Z" },
    {
      id: 2,
      iterationId: 1,
      role: "assistant",
      content: ["【交付物引用】测试矩阵", "摘要：覆盖核心生成路径", "关注点：P0 必过", "请查看交付物并确认。"].join("\n"),
      createdAt: "2026-03-16T10:00:01.000Z"
    }
  ] as never);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.textMessage?.id, 1);
  assert.equal(items[0]?.cardMessage?.id, 2);
});

test("buildIterationChatDisplayItems drops user-authored artifact reference echoes", () => {
  const items = buildIterationChatDisplayItems([
    {
      id: 1,
      iterationId: 1,
      role: "assistant",
      content: ["【交付物引用】设计规范", "摘要：覆盖布局与状态规则", "关注点：design-spec", "请查看交付物并确认。"].join("\n"),
      createdAt: "2026-03-17T16:57:00.000Z"
    },
    {
      id: 2,
      iterationId: 1,
      role: "user",
      content: ["【交付物引用】设计规范", "摘要：覆盖布局与状态规则", "关注点：design-spec", "请查看交付物并确认。"].join("\n"),
      createdAt: "2026-03-17T16:57:01.000Z"
    }
  ] as never);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.leadMessage.id, 1);
  assert.equal(items[0]?.cardMessage?.id, 1);
});

test("normalizeUserChatInput rewrites artifact reference cards into plain follow-up prompts", () => {
  const normalized = normalizeUserChatInput(
    ["【交付物引用】设计规范", "摘要：覆盖布局与状态规则", "关注点：design-spec", "请围绕交付物「design-spec」继续与用户确认，不要直接跨阶段推进。"].join("\n")
  );

  assert.equal(normalized, "请围绕交付物「design-spec」继续与我确认。");
});

test("hasAssistantImpactAssessment only matches explicit agent assessment and confirmation guidance", () => {
  assert.equal(
    hasAssistantImpactAssessment([
      {
        id: 1,
        iterationId: 1,
        role: "assistant",
        content: "我已完成影响评估：当前需求会影响 3 个页面、2 个组件和 1 条代码边界，请确认这些关键边界是否接受。",
        createdAt: "2026-03-16T10:00:00.000Z"
      }
    ] as never),
    true
  );
  assert.equal(
    hasAssistantImpactAssessment([
      {
        id: 1,
        iterationId: 1,
        role: "assistant",
        content: "我会继续推进差异分析，并补充下一步建议。",
        createdAt: "2026-03-16T10:00:00.000Z"
      }
    ] as never),
    false
  );
});

test("iteration workspace renders test-case and delivery drawers from artifact draft content", () => {
  const source = readFileSync(new URL("../src/pages/projects/ArtifactPreviewPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /selectedArtifactKind === "test-cases"/);
  assert.match(source, /selectedArtifactKind === "analysis-report"[\s\S]*value=\{artifactDraftContent\} readOnly showTitle=\{false\}/);
  assert.match(source, /selectedArtifactKind === "release-review"[\s\S]*artifactDraftContent\.trim\(\)/);
  assert.match(source, /selectedArtifactKind === "delivery-package"[\s\S]*artifactDraftContent\.trim\(\)/);
});
