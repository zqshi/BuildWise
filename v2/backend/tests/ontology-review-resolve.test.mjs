import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { resolveReviewTaskOp } = await import(
  "../dist/domain/continuousModeling/resolveReviewTask.js"
);
const { ContinuousModelingService } = await import(
  "../dist/application/continuousModeling/continuousModelingService.js"
);
const { ContinuousModelingWorkspaceService } = await import(
  "../dist/application/continuousModeling/continuousModelingWorkspaceService.js"
);
const { JsonContinuousModelingRepository } = await import(
  "../dist/infrastructure/persistence/jsonContinuousModelingRepository.js"
);
const { createInMemoryWorkspaceRepo } = await import("./helpers/mock-factories.mjs");

// ─── 本体评审解决流程（v0.25.0 T1）────────────────────────────────
// 突出核心价值：用户确认术语/规则后，标记候选快照中的阻断评审「已解决」，
// 使 candidate→publish 前须解决阻断评审（T2 接门禁）。本测试为 Red 驱动 T1 实现。
// 设计约束：仅候选态可解决（已发布=发布即认可、已废弃=无需再解决）；
// 标记幂等（重复确认不阻断用户流程）；保留评审历史（标 resolved，不移除）。

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

function blockingTermReview(id = "review-term-1") {
  return {
    id,
    type: "term_confirmation",
    title: "确认业务术语：客户档案",
    description: "请确认术语「客户档案」的业务定义、别名及技术映射是否准确。",
    blocking: true
  };
}

// ─── 纯函数 resolveReviewTaskOp ───

describe("resolveReviewTaskOp — 本体评审解决（纯函数）", () => {
  test("用户确认候选快照中的阻断评审后，该评审标记为已解决，快照仍保持候选态", () => {
    const candidate = makeSnapshot(11, 21, "candidate", [blockingTermReview()]);
    const result = resolveReviewTaskOp({ snapshot: candidate, reviewTaskId: "review-term-1" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.snapshot.status, "candidate");
    const resolved = result.snapshot.reviewTasks.find((t) => t.id === "review-term-1");
    assert.equal(resolved?.resolved, true);
  });

  test("标记单个评审已解决，不影响同一快照的其他评审任务", () => {
    const candidate = makeSnapshot(11, 21, "candidate", [
      blockingTermReview("review-a"),
      blockingTermReview("review-b")
    ]);
    const result = resolveReviewTaskOp({ snapshot: candidate, reviewTaskId: "review-a" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const a = result.snapshot.reviewTasks.find((t) => t.id === "review-a");
    const b = result.snapshot.reviewTasks.find((t) => t.id === "review-b");
    assert.equal(a?.resolved, true);
    assert.equal(b?.resolved, undefined);
  });

  test("已解决的评审重复标记仍成功（不阻断用户确认流程，幂等）", () => {
    const candidate = makeSnapshot(11, 21, "candidate", [
      { ...blockingTermReview(), resolved: true }
    ]);
    const result = resolveReviewTaskOp({ snapshot: candidate, reviewTaskId: "review-term-1" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const resolved = result.snapshot.reviewTasks.find((t) => t.id === "review-term-1");
    assert.equal(resolved?.resolved, true);
  });

  test("评审任务不存在时，标记已解决被拒绝", () => {
    const candidate = makeSnapshot(11, 21, "candidate", [blockingTermReview()]);
    const result = resolveReviewTaskOp({ snapshot: candidate, reviewTaskId: "no-such-review" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "review_task_not_found");
  });

  test("已发布快照的评审不可再标记已解决（发布即认可，无需重复解决）", () => {
    const published = makeSnapshot(11, 21, "published", [blockingTermReview()]);
    const result = resolveReviewTaskOp({ snapshot: published, reviewTaskId: "review-term-1" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "snapshot_not_candidate");
  });

  test("已废弃快照的评审不可标记已解决", () => {
    const superseded = makeSnapshot(11, 21, "superseded", [blockingTermReview()]);
    const result = resolveReviewTaskOp({ snapshot: superseded, reviewTaskId: "review-term-1" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "snapshot_not_candidate");
  });
});

// ─── 持久化：service 写回 ───

describe("ContinuousModelingService.resolveReviewTask — 持久化写回", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cm-resolve-"));
  });
  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("服务层标记评审已解决后，重新读取快照可见该评审已解决（持久化写回）", () => {
    const repo = new JsonContinuousModelingRepository(join(tmpDir, "resolve-back.json"));
    const service = new ContinuousModelingService(repo);

    repo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [blockingTermReview()]));

    const result = service.resolveReviewTask("snap-11-21-candidate", 11, "review-term-1");
    assert.equal(result.ok, true);

    const reloaded = repo.listSnapshots(11).find((s) => s.id === "snap-11-21-candidate");
    const resolved = reloaded?.reviewTasks.find((t) => t.id === "review-term-1");
    assert.equal(resolved?.resolved, true);
  });

  test("快照不存在时，服务层拒绝标记评审已解决", () => {
    const repo = new JsonContinuousModelingRepository(join(tmpDir, "resolve-missing.json"));
    const service = new ContinuousModelingService(repo);

    const result = service.resolveReviewTask("snap-none", 11, "review-term-1");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "snapshot_not_found");
  });
});

// ─── 工作空间服务：项目校验 ───

describe("ContinuousModelingWorkspaceService.resolveReviewTask — 项目校验", () => {
  test("项目不存在时，工作空间服务拒绝标记评审已解决", () => {
    const workspaceRepo = createInMemoryWorkspaceRepo();
    const modelingRepo = {
      listSnapshots: () => [],
      getLatestPublishedSnapshot: () => null,
      saveCandidateSnapshot: () => {},
      updateSnapshotStatus: () => false
    };
    const service = new ContinuousModelingWorkspaceService(
      new ContinuousModelingService(modelingRepo),
      workspaceRepo,
      modelingRepo
    );

    const result = service.resolveReviewTask("snap-999-1-candidate", 999, "review-term-1");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "project_not_found");
  });
});
