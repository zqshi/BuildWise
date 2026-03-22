import test from "node:test";
import assert from "node:assert/strict";

const { buildUnifiedSkillRegistryOp } = await import(
  "../dist/application/workspace/skillRegistry.js"
);

// ─── 基础场景 ───

test("returns empty registry when all sources empty", () => {
  const result = buildUnifiedSkillRegistryOp([], [], []);
  assert.equal(result.length, 0);
});

test("includes file-pack skills", () => {
  const filePackSkills = [
    { id: "01-ontology-mapping", name: "本体映射", description: "映射技术本体", sopContent: "## SOP 内容" }
  ];
  const result = buildUnifiedSkillRegistryOp(filePackSkills, [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "01-ontology-mapping");
  assert.equal(result[0].source, "file-pack");
  assert.equal(result[0].sopContent, "## SOP 内容");
});

test("includes global custom skills", () => {
  const globalSkills = [
    { id: "custom-1", name: "自定义技能", description: "用户创建", content: "自定义SOP", status: "active" }
  ];
  const result = buildUnifiedSkillRegistryOp([], globalSkills, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "custom-1");
  assert.equal(result[0].source, "global-custom");
});

test("filters out non-active global custom skills", () => {
  const globalSkills = [
    { id: "s1", name: "A", description: "", content: "", status: "active" },
    { id: "s2", name: "B", description: "", content: "", status: "deprecated" }
  ];
  const result = buildUnifiedSkillRegistryOp([], globalSkills, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "s1");
});

// ─── 优先级覆盖 ───

test("global-custom overrides file-pack with same id", () => {
  const filePackSkills = [
    { id: "01-ontology-mapping", name: "Old Name", description: "旧", sopContent: "旧SOP" }
  ];
  const globalSkills = [
    { id: "01-ontology-mapping", name: "New Name", description: "新", content: "新SOP", status: "active" }
  ];
  const result = buildUnifiedSkillRegistryOp(filePackSkills, globalSkills, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "New Name");
  assert.equal(result[0].source, "global-custom");
});

// ─── Policy skillsPlan 过滤 ───

test("policy skillsPlan filters to only planned skills", () => {
  const filePackSkills = [
    { id: "01-ontology-mapping", name: "A", description: "a", sopContent: "sop-a" },
    { id: "02-impact-analysis", name: "B", description: "b", sopContent: "sop-b" },
    { id: "03-deliverable-governance", name: "C", description: "c", sopContent: "sop-c" }
  ];
  const policySkillsPlan = [
    { stage: "development", skills: ["01-ontology-mapping", "03-deliverable-governance"] }
  ];
  const result = buildUnifiedSkillRegistryOp(filePackSkills, [], policySkillsPlan);
  assert.equal(result.length, 2);
  assert.ok(result.some((s) => s.id === "01-ontology-mapping"));
  assert.ok(result.some((s) => s.id === "03-deliverable-governance"));
});

test("policy skillsPlan with agent-selected stage includes all", () => {
  const filePackSkills = [
    { id: "01", name: "A", description: "a", sopContent: "a" },
    { id: "02", name: "B", description: "b", sopContent: "b" }
  ];
  const policySkillsPlan = [
    { stage: "agent-selected", skills: ["01", "02"] }
  ];
  const result = buildUnifiedSkillRegistryOp(filePackSkills, [], policySkillsPlan);
  assert.equal(result.length, 2);
});

// ─── 合并后唯一性 ───

test("deduplicates skills across sources", () => {
  const filePackSkills = [
    { id: "01", name: "File", description: "file", sopContent: "file-sop" }
  ];
  const globalSkills = [
    { id: "02", name: "Global", description: "global", content: "global-sop", status: "active" }
  ];
  const result = buildUnifiedSkillRegistryOp(filePackSkills, globalSkills, []);
  assert.equal(result.length, 2);
  const ids = result.map((s) => s.id);
  assert.deepEqual([...new Set(ids)], ids);
});
