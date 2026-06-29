import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { nextCandidateVersionNumber } = await import(
  "../dist/application/continuousModeling/continuousModelingSupport.js"
);
const { ContinuousModelingService } = await import(
  "../dist/application/continuousModeling/continuousModelingService.js"
);
const { JsonContinuousModelingRepository } = await import(
  "../dist/infrastructure/persistence/jsonContinuousModelingRepository.js"
);
const { resolvePublishFailureHttp } = await import(
  "../dist/interfaces/http/routes/continuousModelingRoutes.js"
);

// ─── 本体候选快照版本化（v0.26.0 T1，方案 B）────────────────────────────────
// 突出核心价值：同迭代多次本体建模生成多版本候选快照，发布后再次建模不覆盖已发布快照。
// 候选 id 含版本序号 snapshot-${projectId}-${iterationId}-v${n}-candidate，
// 从根上消除"publish 后 saveCandidate 覆盖 published"的覆盖 bug。
// 旧快照 id 无版本序号视为 v0，新候选从 v1 起，旧 published 不被覆盖（向后兼容）。

function makeSnapshot(projectId, iterationId, status, id, reviewTasks = []) {
  return {
    id, projectId, iterationId,
    version: `${projectId}.${iterationId}`,
    status,
    ontologyTerms: [], entities: [], relations: [], rules: [],
    reviewTasks,
    derivedFromSnapshotId: null,
    createdAt: "2026-06-29T00:00:00.000Z"
  };
}

function minimalInput(projectId, iterationId) {
  return {
    projectId, iterationId,
    baselineSnapshot: null,
    businessInputs: ["新增本体建模"],
    ontologyTerms: [{ canonicalTerm: "客户", aliases: [], technicalAliases: ["Customer"], definition: "客户实体", evidence: ["v1"] }],
    entities: [{ id: "e1", name: "Customer", businessName: "客户", fields: [{ name: "id", type: "string", required: true }] }],
    relations: [],
    rules: [{ id: "r1", name: "客户唯一", statement: "客户唯一", linkedEntityIds: ["e1"], linkedSurfaceIds: [], linkedApiIds: [] }]
  };
}

// ─── nextCandidateVersionNumber 纯函数 ───

describe("nextCandidateVersionNumber — 候选版本序号计算", () => {
  test("无已有快照 → 1", () => {
    assert.equal(nextCandidateVersionNumber([], 21), 1);
  });

  test("已有 v1 候选 → 2", () => {
    const snapshots = [makeSnapshot(11, 21, "candidate", "snapshot-11-21-v1-candidate")];
    assert.equal(nextCandidateVersionNumber(snapshots, 21), 2);
  });

  test("已有 v1 与 v3 → 4（取最大序号+1）", () => {
    const snapshots = [
      makeSnapshot(11, 21, "candidate", "snapshot-11-21-v1-candidate"),
      makeSnapshot(11, 21, "candidate", "snapshot-11-21-v3-candidate")
    ];
    assert.equal(nextCandidateVersionNumber(snapshots, 21), 4);
  });

  test("旧快照 id 无版本序号 → 视为 v0，新候选从 v1 起", () => {
    const snapshots = [makeSnapshot(11, 21, "published", "snapshot-11-21-candidate")];
    assert.equal(nextCandidateVersionNumber(snapshots, 21), 1);
  });

  test("旧无序号与 v2 共存 → 3（只计版本序号最大值）", () => {
    const snapshots = [
      makeSnapshot(11, 21, "published", "snapshot-11-21-candidate"),
      makeSnapshot(11, 21, "candidate", "snapshot-11-21-v2-candidate")
    ];
    assert.equal(nextCandidateVersionNumber(snapshots, 21), 3);
  });

  test("只计同迭代的快照，忽略其他迭代", () => {
    const snapshots = [
      makeSnapshot(11, 21, "candidate", "snapshot-11-21-v5-candidate"),
      makeSnapshot(11, 22, "candidate", "snapshot-11-22-v9-candidate")
    ];
    assert.equal(nextCandidateVersionNumber(snapshots, 21), 6);
  });
});

// ─── planIterationModeling 版本化 + publish 不覆盖（真实 Json repo） ───

describe("planIterationModeling — 候选快照版本化与发布后不覆盖", () => {
  let tmpDir;
  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "cm-versioning-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function newService(file) {
    const repo = new JsonContinuousModelingRepository(join(tmpDir, file));
    return { repo, service: new ContinuousModelingService(repo) };
  }

  test("首次建模生成 v1 候选快照，id 含版本序号", () => {
    const { service } = newService("first.json");
    const plan = service.planIterationModeling(minimalInput(11, 21));
    assert.equal(plan.candidateSnapshot.id, "snapshot-11-21-v1-candidate");
    assert.equal(plan.candidateSnapshot.version, "11.21.v1.candidate");
  });

  test("发布后再次建模生成 v2 候选，已发布快照保持 published 不被覆盖", () => {
    const { repo, service } = newService("no-overwrite.json");
    // v1：首次建模（有阻断评审：术语「客户」相对空 baseline 为新增）
    const plan1 = service.planIterationModeling(minimalInput(11, 21));
    service.saveCandidate(plan1);
    const v1Id = plan1.candidateSnapshot.id;
    assert.equal(v1Id, "snapshot-11-21-v1-candidate");
    // 解决 v1 阻断评审后发布
    service.resolveReviewTask(v1Id, 11, "review-term-11-21-客户");
    service.publishSnapshot(v1Id, 11);

    // v2：再次建模（baseline=v1 published，术语「客户」已存在→无新增→无阻断）
    const plan2 = service.planIterationModeling(minimalInput(11, 21));
    assert.equal(plan2.candidateSnapshot.id, "snapshot-11-21-v2-candidate");
    service.saveCandidate(plan2);

    // 核心断言：v1 仍为 published，未被 v2 覆盖；v2 为新 candidate
    const snapshots = repo.listSnapshots(11);
    assert.equal(snapshots.length, 2);
    const v1 = snapshots.find((s) => s.id === v1Id);
    const v2 = snapshots.find((s) => s.id === "snapshot-11-21-v2-candidate");
    assert.equal(v1?.status, "published");
    assert.equal(v2?.status, "candidate");
  });

  test("未发布的 v1 候选存在时，再次建模生成 v2，两版本候选并存", () => {
    const { repo, service } = newService("two-candidates.json");
    const plan1 = service.planIterationModeling(minimalInput(11, 21));
    service.saveCandidate(plan1);

    const plan2 = service.planIterationModeling(minimalInput(11, 21));
    service.saveCandidate(plan2);

    const snapshots = repo.listSnapshots(11);
    assert.equal(snapshots.length, 2);
    assert.ok(snapshots.some((s) => s.id === "snapshot-11-21-v1-candidate"));
    assert.ok(snapshots.some((s) => s.id === "snapshot-11-21-v2-candidate"));
  });
});

// ─── resolvePublishFailureHttp — 发布失败 HTTP 映射（T2 遗漏补） ───

describe("resolvePublishFailureHttp — 发布失败原因到 HTTP 状态的映射", () => {
  test("未解决阻断评审 → 409 + 中文提示（须先解决再发布）", () => {
    const r = resolvePublishFailureHttp("unresolved_blocking_reviews");
    assert.equal(r.status, 409);
    assert.ok(r.message.includes("未解决阻断评审"));
  });

  test("快照不存在 → 404", () => {
    const r = resolvePublishFailureHttp("snapshot_not_found");
    assert.equal(r.status, 404);
  });

  test("快照非候选 → 409", () => {
    const r = resolvePublishFailureHttp("snapshot_not_candidate");
    assert.equal(r.status, 409);
  });
});
