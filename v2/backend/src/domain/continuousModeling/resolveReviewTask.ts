/**
 * resolveReviewTaskOp — 本体评审解决（v0.25.0 T1）
 *
 * 突出核心价值：用户确认术语/规则后，标记候选快照中的评审「已解决」，
 * 使 candidate→publish 前须解决阻断评审（T2 接门禁语义）。
 *
 * 设计约束：
 * - 仅候选态（candidate）可解决：已发布=发布即认可（无需重复解决），
 *   已废弃=已让位于新快照（无需再解决）。
 * - 标记幂等：已解决的评审重复标记仍成功，不阻断用户确认流程。
 * - 保留评审历史：标 resolved=true，不移除评审任务（活的知识链条需可追溯）。
 *
 * 纯函数，无外部依赖，返回新快照（不改入参）。持久化由
 * ContinuousModelingService 复用 saveCandidateSnapshot 的 upsert 语义写回。
 */
import type { ModelSnapshot } from "./types";

export type ResolveReviewTaskInput = {
  snapshot: ModelSnapshot;
  reviewTaskId: string;
};

export type ResolveReviewTaskResult =
  | { ok: true; snapshot: ModelSnapshot }
  | { ok: false; reason: "snapshot_not_candidate" | "review_task_not_found" };

export function resolveReviewTaskOp(
  input: ResolveReviewTaskInput
): ResolveReviewTaskResult {
  const { snapshot, reviewTaskId } = input;
  if (snapshot.status !== "candidate") {
    return { ok: false, reason: "snapshot_not_candidate" };
  }
  const target = snapshot.reviewTasks.find((task) => task.id === reviewTaskId);
  if (!target) {
    return { ok: false, reason: "review_task_not_found" };
  }
  // 幂等：已 resolved 仍返回 ok（重复确认不阻断用户流程），返回新快照不改入参
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      reviewTasks: snapshot.reviewTasks.map((task) =>
        task.id === reviewTaskId ? { ...task, resolved: true } : task
      )
    }
  };
}
