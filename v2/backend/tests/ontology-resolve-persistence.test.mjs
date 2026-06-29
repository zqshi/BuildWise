import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { ContinuousModelingService } = await import(
  "../dist/application/continuousModeling/continuousModelingService.js"
);
const { createInMemoryModelingRepo, createInMemoryWorkspaceRepo } = await import(
  "./helpers/mock-factories.mjs"
);
const { ContinuousModelingWorkspaceService } = await import(
  "../dist/application/continuousModeling/continuousModelingWorkspaceService.js"
);

// ─── 评审解决持久化契约（v0.26.0 T2）────────────────────────────────
// 突出核心价值：用 in-memory mock 验证 resolveReviewTask 写回同 id 快照时，
// 多次解决累积 resolved（与真实 JsonContinuousModelingRepository upsert 一致）。
// 修复前 mock 是 push 语义，第二次 resolve 读到第一次 push 的旧快照
// （resolved 未持久化），阻断评审未真正清除 → publish 误阻断。
// mock 与真实 repo 语义对齐后，resolve 写回应覆盖同 id 而非重复 push。

function makeSnapshot(projectId, iterationId, status, reviewTasks = []) {
  return {
    id: `snap-${projectId}-${iterationId}-candidate`,
    projectId, iterationId,
    version: `${projectId}.${iterationId}.candidate`,
    status,
    ontologyTerms: [], entities: [], relations: [], rules: [],
    reviewTasks,
    derivedFromSnapshotId: null,
    createdAt: "2026-06-29T00:00:00.000Z"
  };
}

function blockingReview(id) {
  return {
    id, type: "term_confirmation",
    title: `确认术语`, description: "请确认术语的业务定义。",
    blocking: true
  };
}

describe("resolveReviewTask 持久化契约 — in-memory mock 与真实 repo 行为一致", () => {
  test("同快照两次解决不同评审，resolved 累积持久化（不重复 push 旧快照）", () => {
    const modelingRepo = createInMemoryModelingRepo();
    const service = new ContinuousModelingService(modelingRepo);

    modelingRepo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [
      blockingReview("review-a"),
      blockingReview("review-b")
    ]));

    service.resolveReviewTask("snap-11-21-candidate", 11, "review-a");
    service.resolveReviewTask("snap-11-21-candidate", 11, "review-b");

    // 写回应覆盖同 id，只保留一份；两条评审均 resolved
    const snapshots = modelingRepo.listSnapshots(11);
    assert.equal(snapshots.length, 1, "同 id 快照写回应覆盖，不应重复 push");
    const resolved = snapshots[0].reviewTasks.filter((t) => t.resolved);
    assert.equal(resolved.length, 2, "两次解决的评审均应持久化为已解决");
  });

  test("两次解决后无未解决阻断评审，publish 放行（mock 不再掩盖真实阻断）", () => {
    const modelingRepo = createInMemoryModelingRepo();
    const service = new ContinuousModelingService(modelingRepo);

    modelingRepo.saveCandidateSnapshot(makeSnapshot(11, 21, "candidate", [
      blockingReview("review-a"),
      blockingReview("review-b")
    ]));

    service.resolveReviewTask("snap-11-21-candidate", 11, "review-a");
    service.resolveReviewTask("snap-11-21-candidate", 11, "review-b");

    // 修复前（push）：第二次 resolve 读到第一次 push 的旧快照，
    // review-b 的 resolved 未写到 review-a 已 resolved 的那份 → publish 仍被阻断
    const result = service.publishSnapshot("snap-11-21-candidate", 11);
    assert.equal(result.ok, true, "两次解决后应无未解决阻断评审，publish 放行");
  });

  test("workspaceService 层 resolve 写回同样累积（project 校验后 delegate）", () => {
    const workspaceRepo = createInMemoryWorkspaceRepo();
    const project = workspaceRepo.createProject({
      name: "本体项目", description: "",
      knowledgeBase: {
        ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [],
        decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
      }
    });
    const modelingRepo = createInMemoryModelingRepo();
    const service = new ContinuousModelingWorkspaceService(
      new ContinuousModelingService(modelingRepo), workspaceRepo, modelingRepo
    );

    modelingRepo.saveCandidateSnapshot(makeSnapshot(project.id, 31, "candidate", [
      blockingReview("review-a"),
      blockingReview("review-b")
    ]));
    const snapId = `snap-${project.id}-31-candidate`;

    service.resolveReviewTask(snapId, project.id, "review-a");
    service.resolveReviewTask(snapId, project.id, "review-b");

    const snapshots = modelingRepo.listSnapshots(project.id);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].reviewTasks.filter((t) => t.resolved).length, 2);
  });
});
