import test from "node:test";
import assert from "node:assert/strict";

const { selectOpenclawSkillsFromRegistry } = await import(
  "../dist/application/workspace/workspaceOpenclawSkillsBridge.js"
);

const makeSkill = (id, name = id) => ({
  id,
  name,
  description: `desc-${id}`,
  sopContent: `sop-${id}`,
  source: "file-pack"
});

// ─── 基础场景 ───

test("returns empty when no registry skills", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [],
    userMessage: "测试",
    activeStage: ""
  });
  assert.equal(result.selectedSkills.length, 0);
});

test("selects business-rule-linking skill on rule keywords", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [makeSkill("10-business-rule-linking")],
    userMessage: "这个业务规则需要调整",
    activeStage: ""
  });
  assert.ok(result.selectedSkills.includes("10-business-rule-linking"));
});

test("selects quality-contract skill on testing keywords", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [makeSkill("11-product-rd-quality-contract")],
    userMessage: "准备测试验收",
    activeStage: ""
  });
  assert.ok(result.selectedSkills.includes("11-product-rd-quality-contract"));
});

// ─── 按阶段选择 ───

test("selects skills based on stage-skill mapping from policy", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [
      makeSkill("01-ontology-mapping"),
      makeSkill("02-impact-analysis"),
      makeSkill("06-quality-release-gate")
    ],
    userMessage: "开始分析",
    activeStage: "clarification",
    stageSkillMap: {
      clarification: ["01-ontology-mapping", "02-impact-analysis"],
      release: ["06-quality-release-gate"]
    }
  });
  assert.equal(result.selectedSkills.length, 2);
  assert.ok(result.selectedSkills.includes("01-ontology-mapping"));
  assert.ok(result.selectedSkills.includes("02-impact-analysis"));
});

// ─── 无 stageSkillMap 时 fallback 到关键词匹配 ───

test("falls back to keyword matching when no stageSkillMap", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [
      makeSkill("10-business-rule-linking"),
      makeSkill("11-product-rd-quality-contract"),
      makeSkill("01-ontology-mapping")
    ],
    userMessage: "这个领域规则需要验证",
    activeStage: ""
  });
  assert.ok(result.selectedSkills.includes("10-business-rule-linking"));
});

// ─── 返回选中 skill 的 SOP ───

test("includes sopContent for selected skills", () => {
  const result = selectOpenclawSkillsFromRegistry({
    registrySkills: [makeSkill("10-business-rule-linking")],
    userMessage: "业务规则",
    activeStage: ""
  });
  assert.equal(result.selectedSkillEntries.length, 1);
  assert.equal(result.selectedSkillEntries[0].sopContent, "sop-10-business-rule-linking");
});
