import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { ContinuousModelingService } = await import(
  "../dist/application/continuousModeling/continuousModelingService.js"
);
const { JsonContinuousModelingRepository } = await import(
  "../dist/infrastructure/persistence/jsonContinuousModelingRepository.js"
);
const { OntologyGateService } = await import(
  "../dist/application/continuousModeling/ontologyReleaseGateService.js"
);
const { createInMemoryWorkspaceRepo, createInMemoryModelingRepo } = await import(
  "./helpers/mock-factories.mjs"
);

// ─── 本体发布门禁语义升级（v0.25.0 T2）────────────────────────────────
// 突出核心价值：本体快照从候选到发布前，须先解决所有阻断型评审；
// 全部解决后放行发布，且发布后评审门禁不再因历史阻断评审误阻（发布即认可保留）。
// T1 建了评审解决流程（标 resolved），本测试为 Red 驱动 T2 把评审门禁接入发布前置。

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
    createdAt: "2026-06-29T00:00:00.000Z"
  };
}

function blockingReview(id = "review-term-1", resolved = undefined) {
  const task = {
    id,
    type: "term_confirmation",
    title: `确认业务术语`,
    description: "请确认术语的业务定义、别名及技术映射是否准确。",
    blocking: true
  };
  if (resolved !== undefined) task.resolved = resolved;
  return task;
}

// ─── publishSnapshot 前置：候选快照未解决阻断评审 → 阻断发布 ───

describe("publishSnapshot — 候选快照发布前的阻断评审检查", () => {
  let tmpDir;
  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "cm-publish-gate-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function newService(file) {
    const repo = new JsonContinuousModelingRepository(join(tmpDir, file));
    return { repo, service: new ContinuousModelingService(repo) };
  }

  test("候选快照有未解决阻断评审 → 发布被阻断（须先解决）", () => {
    const { repo, service } = newService("blocking.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [blockingReview()]));

    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unresolved_blocking_reviews");
  });

  test("候选快照的阻断评审全部解决后 → 发布放行", () => {
    const { repo, service } = newService("resolved.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [
      blockingReview("review-a"),
      blockingReview("review-b")
    ]));

    service.resolveReviewTask("snap-11-21-candidate", 11, "review-a");
    service.resolveReviewTask("snap-11-21-candidate", 11, "review-b");

    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, true);
  });

  test("候选快照无阻断评审 → 发布放行（维持原有行为）", () => {
    const { repo, service } = newService("none.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", []));

    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, true);
  });

  test("候选快照阻断评审已全部标记已解决 → 发布放行", () => {
    const { repo, service } = newService("all-resolved.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [
      blockingReview("review-a", true),
      blockingReview("review-b", true)
    ]));

    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, true);
  });

  test("部分解决仍有未解决阻断评审 → 发布被阻断", () => {
    const { repo, service } = newService("partial.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [
      blockingReview("review-a", true),
      blockingReview("review-b")
    ]));

    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unresolved_blocking_reviews");
  });

  test("已发布快照再次发布 → 拒绝（非候选，不查评审）", () => {
    const { repo, service } = newService("published.json");
    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "published", [blockingReview()]));

    const result = service.publishSnapshot("snap-11-21-published", 11);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "snapshot_not_candidate");
  });
});

// ─── OntologyGateService：未解决阻断评审过滤（交付门禁） ───

describe("OntologyGateService — 仅未解决阻断评审计入交付门禁", () => {
  function setup() {
    const repo = createInMemoryWorkspaceRepo();
    const project = repo.createProject({
      name: "本体门禁项目", description: "",
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
    return { gate, iteration, project, modelingRepo };
  }

  test("候选快照有未解决阻断评审 → 交付门禁阻断，理由只计未解决项数", () => {
    const { gate, iteration, project, modelingRepo } = setup();
    // 两条阻断评审，一条已解决 → 仅一条未解决计入门禁
    modelingRepo.saveCandidateSnapshot(
      makeSnapshot(project.id, iteration.id, "candidate", [
        blockingReview("review-a"),
        blockingReview("review-b", true)
      ])
    );
    const result = gate.evaluateOntologyGate(iteration.id);
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes("1 项未解决阻断评审")));
  });

  test("已发布快照有历史阻断评审（含未解决）→ 交付门禁放行（发布即认可，不误阻）", () => {
    const { gate, iteration, project, modelingRepo } = setup();
    modelingRepo.saveCandidateSnapshot(
      makeSnapshot(project.id, iteration.id, "published", [
        blockingReview("review-a"),
        blockingReview("review-b", true)
      ])
    );
    const result = gate.evaluateOntologyGate(iteration.id);
    assert.equal(result.passed, true);
    assert.equal(result.reasons.length, 0);
  });
});
