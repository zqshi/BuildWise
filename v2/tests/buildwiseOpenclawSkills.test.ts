import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const skillsRoot = resolve(v2Dir, "backend", "skills", "buildwise-openclaw");

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

test("buildwise openclaw skills declare clear boundaries and agent-led composition", () => {
  const read = (name: string) => readFileSync(resolve(skillsRoot, name, "SKILL.md"), "utf-8");

  const orchestrator = read("00-orchestrator-sop");
  const ontology = read("01-ontology-mapping");
  const impact = read("02-impact-analysis");
  const deliverable = read("03-deliverable-governance");
  const crossIteration = read("04-cross-iteration");
  const exceptionRecovery = read("05-exception-recovery");
  const releaseGate = read("06-quality-release-gate");
  const audit = read("07-audit-trace");
  const agenticContract = read("08-agentic-flow-contract");
  const contentContract = read("09-deliverable-content-contract");
  const businessRuleContract = read("10-business-rule-linking");
  const productRdQualityContract = read("11-product-rd-quality-contract");

  assert.match(orchestrator, /This skill owns orchestration only/);
  assert.match(orchestrator, /Select and invoke downstream skills/);
  assert.match(agenticContract, /self-compose skills/);
  assert.match(ontology, /only builds traceability structure/);
  assert.match(impact, /only evaluates impact and execution risk/);
  assert.match(deliverable, /governs deliverable state only/);
  assert.match(crossIteration, /only handles inheritance and delta classification/);
  assert.match(exceptionRecovery, /only operates when an exception or unsafe state exists/);
  assert.match(releaseGate, /only decides release readiness and rollback expectations/);
  assert.match(audit, /only validates traceability and replayability/);
  assert.match(contentContract, /only defines what a deliverable must contain/);
  assert.match(businessRuleContract, /only links business knowledge to engineering objects/);
  assert.match(productRdQualityContract, /only defines cross-stage quality requirements/);
});

test("coach contract context exposes progressive skill loading instead of fixed chain execution", () => {
  const contractSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceCoachInteractionContract.ts"),
    "utf-8"
  );
  const bridgeSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceOpenclawSkillsBridge.ts"),
    "utf-8"
  );
  assert.match(contractSource, /buildOpenclawSkillsPackContext/);
  assert.match(bridgeSource, /skills\.mode=agent-led/);
  assert.match(bridgeSource, /skills\.progressive_loading=yes/);
  assert.match(bridgeSource, /agent chooses and loads only the minimum required skills/);
});

test("runtime bridge selects business-rule and product-rd skills with evidence", () => {
  const bridgeSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceOpenclawSkillsBridge.ts"),
    "utf-8"
  );
  const coachSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceCoachOps.ts"),
    "utf-8"
  );
  const runtimeSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceOpenclawOps.ts"),
    "utf-8"
  );

  // Bridge uses registry-based selection with keyword pattern matching
  assert.match(bridgeSource, /business-rule/);
  assert.match(bridgeSource, /quality-contract/);
  assert.match(bridgeSource, /selected_skills=/);
  assert.match(bridgeSource, /selection_reasons=/);
  assert.match(bridgeSource, /buildOpenclawSkillSelectionContext/);
  assert.match(bridgeSource, /selectOpenclawSkillsFromRegistry/);
  assert.match(bridgeSource, /buildUnifiedSkillRegistryOp/);
  assert.match(coachSource, /skill_reasons=/);
  assert.match(coachSource, /buildOpenclawSkillSelectionContext/);
  assert.match(runtimeSource, /summarizeProjectSkillSelection/);
  assert.match(runtimeSource, /\[skills selection\]/);
});

test("policy and runtime copy describe agent-selected skills rather than hardcoded stage chain", () => {
  const policySource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServicePolicyOps.ts"),
    "utf-8"
  );
  const runtimeSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceOpenclawOps.ts"),
    "utf-8"
  );

  assert.match(policySource, /stage:\s*"agent-selected"/);
  assert.match(runtimeSource, /渐进式加载/);
  assert.doesNotMatch(runtimeSource, /skills链路：\$\{sequence\.join\(" -> "\)\}/);
});
