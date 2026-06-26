import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { detectChangeImpactOp } from "../dist/domain/workspace/changeImpactDetection.js";

function kb(overrides = {}) {
  return {
    ontologyTerms: [],
    componentInventory: [],
    stableRules: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "",
    ...overrides,
  };
}

describe("detectChangeImpactOp — 需求影响范围前置检测", () => {
  test("命中 ontologyTerms.term → affectedTerms 含该项", () => {
    const result = detectChangeImpactOp({
      userMessage: "调整线索状态机",
      knowledgeBase: kb({ ontologyTerms: [{ term: "线索状态机", aliases: [], definition: "d", evidence: "e" }] }),
    });
    assert.equal(result.hasImpact, true);
    assert.deepEqual(result.affectedTerms, ["线索状态机"]);
  });

  test("命中 ontologyTerms.aliases 同样计为命中该术语", () => {
    const result = detectChangeImpactOp({
      userMessage: "修改 lead 的归属",
      knowledgeBase: kb({ ontologyTerms: [{ term: "线索", aliases: ["lead"], definition: "d", evidence: "e" }] }),
    });
    assert.equal(result.hasImpact, true);
    assert.deepEqual(result.affectedTerms, ["线索"]);
  });

  test("命中 componentInventory.component → affectedEntities 含 + affectedArtifacts 含 relatedCodePaths", () => {
    const result = detectChangeImpactOp({
      userMessage: "改 KPI 卡片组件",
      knowledgeBase: kb({
        componentInventory: [{
          component: "KPI 卡片", responsibility: "展示关键指标",
          relatedRequirements: ["REQ-kpi"], relatedCodePaths: ["src/dashboard/kpi.tsx"],
        }],
      }),
    });
    assert.equal(result.hasImpact, true);
    assert.deepEqual(result.affectedEntities, ["KPI 卡片"]);
    assert.deepEqual(result.affectedArtifacts, ["src/dashboard/kpi.tsx"]);
  });

  test("命中 componentInventory.responsibility 也计入该组件", () => {
    const result = detectChangeImpactOp({
      userMessage: "调整展示关键指标的能力",
      knowledgeBase: kb({
        componentInventory: [{
          component: "KPI 卡片", responsibility: "展示关键指标",
          relatedRequirements: [], relatedCodePaths: ["src/kpi.tsx"],
        }],
      }),
    });
    assert.equal(result.hasImpact, true);
    assert.deepEqual(result.affectedEntities, ["KPI 卡片"]);
  });

  test("命中 stableRules.rule → affectedRules 含", () => {
    const result = detectChangeImpactOp({
      userMessage: "状态只能向前推进",
      knowledgeBase: kb({ stableRules: [{ rule: "状态只能向前推进", rationale: "r", source: "s" }] }),
    });
    assert.equal(result.hasImpact, true);
    assert.deepEqual(result.affectedRules, ["状态只能向前推进"]);
  });

  test("本体为空 → hasImpact=false，所有数组为空", () => {
    const result = detectChangeImpactOp({ userMessage: "任意需求", knowledgeBase: kb() });
    assert.equal(result.hasImpact, false);
    assert.deepEqual(result.affectedTerms, []);
    assert.deepEqual(result.affectedEntities, []);
    assert.deepEqual(result.affectedRules, []);
    assert.deepEqual(result.affectedArtifacts, []);
  });

  test("knowledgeBase 缺省（null）→ hasImpact=false 不报错", () => {
    const result = detectChangeImpactOp({ userMessage: "任意需求", knowledgeBase: null });
    assert.equal(result.hasImpact, false);
  });

  test("有本体但需求文本无关 → hasImpact=false", () => {
    const result = detectChangeImpactOp({
      userMessage: "完全无关的 xyz 内容",
      knowledgeBase: kb({ ontologyTerms: [{ term: "线索状态机", aliases: [], definition: "d", evidence: "e" }] }),
    });
    assert.equal(result.hasImpact, false);
    assert.deepEqual(result.affectedTerms, []);
  });

  test("多命中 → summary 计数正确且去重", () => {
    const result = detectChangeImpactOp({
      userMessage: "线索状态机 和 KPI 卡片",
      knowledgeBase: kb({
        ontologyTerms: [{ term: "线索状态机", aliases: [], definition: "d", evidence: "e" }],
        componentInventory: [{
          component: "KPI 卡片", responsibility: "展示指标",
          relatedRequirements: [], relatedCodePaths: ["src/kpi.tsx"],
        }],
        stableRules: [{ rule: "线索状态机不可逆", rationale: "r", source: "s" }],
      }),
    });
    assert.equal(result.hasImpact, true);
    assert.equal(result.affectedTerms.length, 1);
    assert.equal(result.affectedEntities.length, 1);
    assert.equal(result.affectedRules.length, 1);
    assert.ok(/检测到 3 个本体项可能受影响/.test(result.summary), result.summary);
  });

  test("空需求文本 → hasImpact=false（不空匹配）", () => {
    const result = detectChangeImpactOp({
      userMessage: "",
      knowledgeBase: kb({ ontologyTerms: [{ term: "线索", aliases: [], definition: "d", evidence: "e" }] }),
    });
    assert.equal(result.hasImpact, false);
  });
});
