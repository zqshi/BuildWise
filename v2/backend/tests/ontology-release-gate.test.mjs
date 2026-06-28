import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { evaluateOntologyReleaseGate } = await import(
  "../dist/domain/continuousModeling/ontologyReleaseGate.js"
);

// ─── 本体发布门禁（状态机 + 评审）────────────────────────────────
// 突出核心价值：发布前本体快照须已发布、且无未解决阻断评审，否则不放行。
// 当前两类元能力空转（门禁不读快照状态、不检查评审），本测试为 Red 驱动 T2a/T2b 激活。

describe("evaluateOntologyReleaseGate — 本体发布门禁", () => {
  test("无快照（none）→ 放行（温和：不强制每个迭代做本体）", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "none",
      blockingReviewTasks: [],
    });
    assert.equal(result.passed, true);
    assert.equal(result.reasons.length, 0);
  });

  test("快照为候选（candidate）未发布 → 阻断", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "candidate",
      blockingReviewTasks: [],
    });
    assert.equal(result.passed, false);
  });

  test("快照已废弃（superseded）未发布 → 阻断", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "superseded",
      blockingReviewTasks: [],
    });
    assert.equal(result.passed, false);
  });

  test("快照已发布即使有历史阻断评审 → 放行（发布即认可，不误卡正常流程）", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "published",
      blockingReviewTasks: [
        { id: "r1", type: "term_confirmation", title: "确认术语", description: "d", blocking: true },
      ],
    });
    assert.equal(result.passed, true);
    assert.equal(result.reasons.length, 0);
  });

  test("candidate 快照有阻断评审 → 阻断，理由含未发布与评审", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "candidate",
      blockingReviewTasks: [
        { id: "r1", type: "term_confirmation", title: "确认术语", description: "d", blocking: true },
      ],
    });
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes("未发布")));
    assert.ok(result.reasons.some((r) => r.includes("阻断评审")));
  });

  test("快照已发布且无阻断评审 → 放行", () => {
    const result = evaluateOntologyReleaseGate({
      latestSnapshotStatus: "published",
      blockingReviewTasks: [],
    });
    assert.equal(result.passed, true);
    assert.equal(result.reasons.length, 0);
  });
});
