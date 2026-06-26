import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { ChangeImpactService } = await import(
  "../dist/application/workspace/changeControl/changeImpactService.js"
);

function kb(overrides = {}) {
  return {
    ontologyTerms: [], componentInventory: [], stableRules: [],
    codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: "",
    ...overrides,
  };
}

function setup(withKb = true) {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "t", description: "d", tenantId: "t1", ownerUserId: "u1" });
  if (withKb) {
    repo.updateProject({ ...project, knowledgeBase: kb({ ontologyTerms: [{ term: "线索状态机", aliases: ["lead"], definition: "d", evidence: "e" }] }) });
  }
  const iteration = repo.createIteration(project.id, { name: "iter", description: "d" });
  const service = new ChangeImpactService(repo);
  return { repo, project, iteration, service };
}

test("detectChangeImpact: 迭代存在且本体命中 → hasImpact=true", () => {
  const { service, iteration } = setup(true);
  const result = service.detectChangeImpact(iteration.id, "调整线索状态机");
  assert.equal(result.hasImpact, true);
  assert.deepEqual(result.affectedTerms, ["线索状态机"]);
});

test("detectChangeImpact: 迭代无本体 → hasImpact=false（诚实，不造假）", () => {
  const { service, iteration } = setup(false);
  const result = service.detectChangeImpact(iteration.id, "任意需求");
  assert.equal(result.hasImpact, false);
});

test("detectChangeImpact: 迭代不存在 → hasImpact=false 且提示", () => {
  const { service } = setup(true);
  const result = service.detectChangeImpact(999999, "任意需求");
  assert.equal(result.hasImpact, false);
  assert.match(result.summary, /迭代不存在/);
});
