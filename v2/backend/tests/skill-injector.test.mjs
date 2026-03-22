import test from "node:test";
import assert from "node:assert/strict";

const { buildSkillPromptInjection } = await import(
  "../dist/application/workspace/skillInjector.js"
);

test("returns empty string for empty skills", () => {
  const result = buildSkillPromptInjection([], {});
  assert.equal(result, "");
});

test("injects single skill SOP content", () => {
  const skills = [
    { id: "01-ontology", name: "本体映射", description: "desc", sopContent: "## 步骤\n1. 映射\n2. 验证", source: "file-pack" }
  ];
  const result = buildSkillPromptInjection(skills, {});
  assert.ok(result.includes("01-ontology"));
  assert.ok(result.includes("## 步骤"));
  assert.ok(result.includes("映射"));
});

test("limits to maxSkills", () => {
  const skills = Array.from({ length: 5 }, (_, i) => ({
    id: `skill-${i}`,
    name: `Skill ${i}`,
    description: "desc",
    sopContent: "content ".repeat(10),
    source: "file-pack"
  }));
  const result = buildSkillPromptInjection(skills, { maxSkills: 2 });
  const skillBlocks = result.match(/\[SKILL:/g) || [];
  assert.equal(skillBlocks.length, 2);
});

test("limits to maxTotalChars", () => {
  const skills = [
    { id: "big-skill", name: "Big", description: "desc", sopContent: "x".repeat(10000), source: "file-pack" }
  ];
  const result = buildSkillPromptInjection(skills, { maxTotalChars: 500 });
  assert.ok(result.length <= 600); // some header overhead
});

test("formats skills with section markers", () => {
  const skills = [
    { id: "01", name: "A", description: "alpha", sopContent: "Do alpha things", source: "file-pack" },
    { id: "02", name: "B", description: "beta", sopContent: "Do beta things", source: "global-custom" }
  ];
  const result = buildSkillPromptInjection(skills, {});
  assert.ok(result.includes("[SKILL: 01]"));
  assert.ok(result.includes("[SKILL: 02]"));
  assert.ok(result.includes("Do alpha things"));
  assert.ok(result.includes("Do beta things"));
});

test("truncates individual skill SOP when over budget", () => {
  const skills = [
    { id: "01", name: "A", description: "a", sopContent: "a".repeat(5000), source: "file-pack" },
    { id: "02", name: "B", description: "b", sopContent: "b".repeat(5000), source: "file-pack" }
  ];
  const result = buildSkillPromptInjection(skills, { maxTotalChars: 4000, maxSkills: 3 });
  assert.ok(result.length <= 4200);
});
