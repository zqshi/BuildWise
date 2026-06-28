import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, createInMemoryModelingRepo } from "./helpers/mock-factories.mjs";

const { OntologyGateService } = await import(
  "../dist/application/continuousModeling/ontologyReleaseGateService.js"
);

// ─── OntologyGateService 本体发布门禁（v0.24.0 核心价值主线夯实）────────
// 验证 fullCycle delivery-package 接入的本体门禁：温和策略下不误阻断无本体建模的发布流程，
// 仅当「有快照但未发布」或「有未解决阻断评审」时阻断。突出核心价值同时保投产稳定。

function makeSnapshot(projectId, iterationId, status, reviewTasks = []) {
  return {
    id: `snap-${projectId}-${iterationId}-${status}`,
    projectId,
    iterationId,
    version: `${projectId}.${iterationId}.${status}`,
    status,
    ontologyTerms: [],
    entities: [],
    relations: [],
    rules: [],
    reviewTasks,
    derivedFromSnapshotId: null,
    createdAt: "2026-06-28T00:00:00.000Z"
  };
}

function setup() {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({
    name: "本体门禁项目",
    description: "",
    knowledgeBase: {
      ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [],
      decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
    }
  });
  const iteration = repo.createIteration(project.id, {
    version: "1.0.0", name: "迭代1", goals: [], modules: []
  });
  const modelingRepo = createInMemoryModelingRepo();
  const gate = new OntologyGateService(repo, modelingRepo);
  return { repo, project, iteration, modelingRepo, gate };
}

test("无快照 → 放行（温和：不误阻断无本体建模的发布流程）", () => {
  const { gate, iteration } = setup();
  const result = gate.evaluateOntologyGate(iteration.id);
  assert.equal(result.passed, true);
  assert.equal(result.reasons.length, 0);
});

test("candidate 快照未发布 → 阻断", () => {
  const { gate, iteration, project, modelingRepo } = setup();
  modelingRepo.saveCandidateSnapshot(makeSnapshot(project.id, iteration.id, "candidate"));
  const result = gate.evaluateOntologyGate(iteration.id);
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes("未发布")));
});

test("published 快照无阻断评审 → 放行", () => {
  const { gate, iteration, project, modelingRepo } = setup();
  const snap = makeSnapshot(project.id, iteration.id, "candidate");
  modelingRepo.saveCandidateSnapshot(snap);
  modelingRepo.updateSnapshotStatus(snap.id, "published");
  const result = gate.evaluateOntologyGate(iteration.id);
  assert.equal(result.passed, true);
});

test("published 快照有历史阻断评审 → 放行（发布即认可，不误卡正常流程）", () => {
  const { gate, iteration, project, modelingRepo } = setup();
  const snap = makeSnapshot(project.id, iteration.id, "candidate", [
    { id: "r1", type: "term_confirmation", title: "确认术语", description: "d", blocking: true }
  ]);
  modelingRepo.saveCandidateSnapshot(snap);
  modelingRepo.updateSnapshotStatus(snap.id, "published");
  const result = gate.evaluateOntologyGate(iteration.id);
  assert.equal(result.passed, true);
});

test("迭代不存在 → 放行（不阻断，由其他门禁处理）", () => {
  const { gate } = setup();
  const result = gate.evaluateOntologyGate(99999);
  assert.equal(result.passed, true);
});
