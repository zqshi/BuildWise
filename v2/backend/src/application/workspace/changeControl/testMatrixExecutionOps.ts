/**
 * testMatrixExecutionOps — 测试矩阵执行更新辅助
 *
 * 从 coreOps 拆出的非导出辅助函数，服务于 updateIterationTestMatrixExecutionOp：
 * - 执行更新项规整（trim/过滤/类型守卫）
 * - 矩阵执行状态应用
 *
 * 纯函数，无 IO 依赖。
 */
import { type TestMatrixExecutionUpdate } from './artifactWorkflow';
import { defaultIterationChangeControl } from '../shared/common';

export function normalizeExecutionUpdates(updates: TestMatrixExecutionUpdate[]) {
  return (Array.isArray(updates) ? updates : [])
    .map((item) => ({
      caseId: typeof item?.caseId === "string" ? item.caseId.trim() : "",
      status: typeof item?.status === "string" ? item.status.trim().toLowerCase() : "",
      by: typeof item?.by === "string" ? item.by.trim() : "",
      note: typeof item?.note === "string" ? item.note.trim() : ""
    }))
    .filter((item) => item.caseId.length > 0);
}

export function applyMatrixUpdates(
  matrix: ReturnType<typeof defaultIterationChangeControl>["generatedTestMatrix"],
  normalizedUpdates: ReturnType<typeof normalizeExecutionUpdates>,
  now: string
) {
  const updateMap = new Map(normalizedUpdates.map((item) => [item.caseId, item]));
  return matrix.map((item) => {
    const update = updateMap.get(item.caseId);
    if (!update) return item;
    return {
      ...item,
      executionStatus: update.status as "pending" | "passed" | "failed" | "blocked" | "skipped",
      executionUpdatedAt: now, executionBy: update.by || "qa", executionNote: update.note || ""
    };
  });
}
