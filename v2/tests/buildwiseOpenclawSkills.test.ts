import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(testDir, "..", "backend", "skills", "buildwise-openclaw");

test("buildwise openclaw skill chain includes content, business-rule, and product-rd quality contracts", () => {
  const chainPath = resolve(skillsRoot, "skill-chain.json");
  const readmePath = resolve(skillsRoot, "README.md");
  const contentSkillPath = resolve(skillsRoot, "09-deliverable-content-contract", "SKILL.md");
  const businessRuleSkillPath = resolve(skillsRoot, "10-business-rule-linking", "SKILL.md");
  const productQualitySkillPath = resolve(skillsRoot, "11-product-rd-quality-contract", "SKILL.md");

  assert.equal(existsSync(contentSkillPath), true, "missing deliverable content contract skill");
  assert.equal(existsSync(businessRuleSkillPath), true, "missing business rule linking skill");
  assert.equal(existsSync(productQualitySkillPath), true, "missing product rd quality contract skill");

  const chain = JSON.parse(readFileSync(chainPath, "utf-8")) as { sequence?: string[] };
  assert.ok(Array.isArray(chain.sequence), "missing skill sequence");
  assert.ok(chain.sequence?.includes("09-deliverable-content-contract"), "skill chain missing deliverable content contract");
  assert.ok(chain.sequence?.includes("10-business-rule-linking"), "skill chain missing business rule linking");
  assert.ok(chain.sequence?.includes("11-product-rd-quality-contract"), "skill chain missing product rd quality contract");

  const readme = readFileSync(readmePath, "utf-8");
  assert.match(readme, /09-deliverable-content-contract/);
  assert.match(readme, /10-business-rule-linking/);
  assert.match(readme, /11-product-rd-quality-contract/);

  const contentSkill = readFileSync(contentSkillPath, "utf-8");
  assert.match(contentSkill, /product-requirements-doc/);
  assert.match(contentSkill, /design-spec/);
  assert.match(contentSkill, /technical-architecture/);
  assert.match(contentSkill, /code-delivery/);
  assert.match(contentSkill, /Never emit placeholder prose/);

  const businessRuleSkill = readFileSync(businessRuleSkillPath, "utf-8");
  assert.match(businessRuleSkill, /domain knowledge/);
  assert.match(businessRuleSkill, /business users/);
  assert.match(businessRuleSkill, /state transitions/);

  const productQualitySkill = readFileSync(productQualitySkillPath, "utf-8");
  assert.match(productQualitySkill, /UX \/ Prototype Quality/);
  assert.match(productQualitySkill, /business-rule validation/);
  assert.match(productQualitySkill, /Never unlock a downstream stage only because an artifact exists/);
});

