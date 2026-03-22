import test from "node:test";
import assert from "node:assert/strict";

const { buildSkillPromptInjection } = await import(
  "../dist/application/workspace/skillInjector.js"
);
const { buildUnifiedSkillRegistryOp } = await import(
  "../dist/application/workspace/skillRegistry.js"
);
const { selectOpenclawSkillsFromRegistry } = await import(
  "../dist/application/workspace/workspaceOpenclawSkillsBridge.js"
);

// ─── 端到端集成：三源合一 → 选择 → 注入 prompt ───

test("end-to-end: registry → selection → injection produces SOP content", () => {
  const filePackSkills = [
    { id: "10-business-rule-linking", name: "业务规则链接", description: "desc", sopContent: "## 业务规则SOP\n1. 识别规则\n2. 映射工程对象" },
    { id: "11-product-rd-quality-contract", name: "产研质量", description: "desc", sopContent: "## 质量SOP\n1. 验证交付物\n2. 校验闭环" },
    { id: "01-ontology-mapping", name: "本体映射", description: "desc", sopContent: "## 本体映射SOP" }
  ];
  const globalSkills = [
    { id: "custom-rule", name: "自定义规则", description: "用户自定义", content: "自定义规则SOP正文", status: "active" }
  ];
  const policySkillsPlan = [];

  // Step 1: 构建统一注册表
  const registry = buildUnifiedSkillRegistryOp(filePackSkills, globalSkills, policySkillsPlan);
  assert.equal(registry.length, 4);

  // Step 2: 基于用户消息选择 skill
  const selection = selectOpenclawSkillsFromRegistry({
    registrySkills: registry,
    userMessage: "这个业务规则需要验证",
    activeStage: ""
  });
  assert.ok(selection.selectedSkills.length > 0);
  assert.ok(selection.selectedSkillEntries.length > 0);

  // Step 3: 注入 prompt
  const injection = buildSkillPromptInjection(selection.selectedSkillEntries, {});
  assert.ok(injection.length > 0);
  assert.ok(injection.includes("[SKILL:"));
  // SOP 正文应该被包含
  for (const entry of selection.selectedSkillEntries) {
    assert.ok(injection.includes(entry.id));
  }
});

test("end-to-end with policy filter: only planned skills reach prompt", () => {
  const filePackSkills = [
    { id: "01-ontology-mapping", name: "A", description: "a", sopContent: "ontology sop" },
    { id: "02-impact-analysis", name: "B", description: "b", sopContent: "impact sop" },
    { id: "10-business-rule-linking", name: "C", description: "c", sopContent: "rule sop" }
  ];
  const policySkillsPlan = [
    { stage: "clarification", skills: ["01-ontology-mapping"] }
  ];

  const registry = buildUnifiedSkillRegistryOp(filePackSkills, [], policySkillsPlan);
  assert.equal(registry.length, 1);
  assert.equal(registry[0].id, "01-ontology-mapping");

  const selection = selectOpenclawSkillsFromRegistry({
    registrySkills: registry,
    userMessage: "分析",
    activeStage: "clarification",
    stageSkillMap: { clarification: ["01-ontology-mapping"] }
  });
  assert.equal(selection.selectedSkills.length, 1);

  const injection = buildSkillPromptInjection(selection.selectedSkillEntries, {});
  assert.ok(injection.includes("ontology sop"));
  assert.ok(!injection.includes("impact sop"));
  assert.ok(!injection.includes("rule sop"));
});
