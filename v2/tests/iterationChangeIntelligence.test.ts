import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtifactImpactHeadline,
  buildArtifactImpactSummary,
  buildChangeIntelligenceHeadline,
  buildChangeIntelligenceSummary
} from "../src/pages/projects/iterationChangeIntelligence.ts";

const iteration = {
  changeControl: {
    changeSource: {
      type: "mixed",
      rawInput: "通过自然语言和 HTML 原型描述导出能力调整。",
      attachments: ["docs/change.md", "prototype/export.html"],
      references: ["iteration:1", "artifact:交付归档"]
    },
    knowledgeHits: ["命中抽屉规则", "命中导出组件映射"],
    knowledgeConflicts: ["通知链路不得阻塞主路径"],
    normalizedFunctionalPoints: ["线索导出", "通知链路回滚"],
    mappingAuditTrail: [
      {
        id: "map-1",
        sourceType: "natural-language",
        functionalPoint: "线索导出",
        mappingConfidence: "high",
        impactedArtifacts: ["analysis-report", "prototype-preview"],
        requirementRefs: ["REQ-1"],
        componentRefs: ["LeadListToolbar"],
        codePaths: ["apps/web/src/leads/toolbar"],
        createdAt: "2026-03-13T00:00:00.000Z"
      },
      {
        id: "map-2",
        sourceType: "history-reference",
        functionalPoint: "通知链路回滚",
        mappingConfidence: "high",
        impactedArtifacts: ["release-review", "analysis-report"],
        requirementRefs: ["REQ-2"],
        componentRefs: ["FollowupComposer"],
        codePaths: ["apps/api/src/notifications"],
        createdAt: "2026-03-13T00:00:00.000Z"
      }
    ]
  }
} as never;

test("buildChangeIntelligenceSummary aggregates multimodal input and impacted artifacts", () => {
  const summary = buildChangeIntelligenceSummary(iteration);
  assert.ok(summary);
  assert.equal(summary?.sourceLabel, "混合输入");
  assert.deepEqual(summary?.normalizedFunctionalPoints, ["线索导出", "通知链路回滚"]);
  assert.deepEqual(summary?.impactedArtifactIds, ["analysis-report", "prototype-preview", "release-review"]);
});

test("buildChangeIntelligenceHeadline compresses top panel into a compact status summary", () => {
  const summary = buildChangeIntelligenceSummary(iteration);
  assert.equal(buildChangeIntelligenceHeadline(summary), "2 个功能点 · 2 条知识命中 · 1 条约束冲突 · 3 个受影响交付物");
});

test("buildChangeIntelligenceSummary tolerates missing changeSource on legacy change-control data", () => {
  const summary = buildChangeIntelligenceSummary({
    changeControl: {
      knowledgeHits: ["沿用 V1 状态流转定义"],
      knowledgeConflicts: [],
      normalizedFunctionalPoints: ["导出能力"],
      mappingAuditTrail: [{ impactedArtifacts: ["product-requirements-doc"] }]
    }
  } as never);
  assert.ok(summary);
  assert.equal(summary?.sourceLabel, "未识别");
  assert.equal(summary?.rawInput, "");
  assert.deepEqual(summary?.attachments, []);
  assert.deepEqual(summary?.references, []);
  assert.deepEqual(summary?.impactedArtifactIds, ["product-requirements-doc"]);
});

test("buildChangeIntelligenceSummary returns null for empty mapping shell", () => {
  const summary = buildChangeIntelligenceSummary({
    changeControl: {
      changeSource: {
        type: "unknown",
        rawInput: "",
        attachments: [],
        references: [],
        updatedAt: "2026-03-13T00:00:00.000Z"
      },
      knowledgeHits: [],
      knowledgeConflicts: [],
      normalizedFunctionalPoints: [],
      mappingAuditTrail: []
    }
  } as never);
  assert.equal(summary, null);
});

test("buildArtifactImpactSummary narrows mapping context for a selected artifact", () => {
  const summary = buildArtifactImpactSummary(iteration, {
    id: "analysis-report",
    title: "继承差异分析报告"
  } as never);
  assert.ok(summary);
  assert.deepEqual(summary?.functionalPoints, ["线索导出", "通知链路回滚"]);
  assert.deepEqual(summary?.requirementRefs, ["REQ-1", "REQ-2"]);
  assert.ok(summary?.codePaths.includes("apps/api/src/notifications"));
});

test("buildArtifactImpactHeadline compresses mapping context into a collapsed summary", () => {
  const summary = buildArtifactImpactSummary(iteration, {
    id: "analysis-report",
    title: "继承差异分析报告"
  } as never);
  assert.equal(buildArtifactImpactHeadline(summary), "2 个功能点 · 2 条需求映射 · 2 个组件映射 · 2 条代码边界");
});

