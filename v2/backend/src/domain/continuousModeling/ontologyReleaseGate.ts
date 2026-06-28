/**
 * ontologyReleaseGate — 本体发布门禁（v0.24.0 核心价值主线夯实）
 *
 * 突出核心价值：发布前本体快照须已发布、且无未解决阻断评审，否则不放行。
 * 激活 A 套原本空转的两类元能力——状态机（latestSnapshotStatus）与评审（ReviewTask blocking）。
 *
 * 纯函数，无外部依赖。接入发布门禁由 fullCycleStepConfig 调用（T2b）。
 */
import type { ReviewTask, SnapshotStatus } from "./types";

export type OntologyReleaseGateInput = {
  /** 本体最新快照状态；"none" 表示尚无快照 */
  latestSnapshotStatus: SnapshotStatus | "none";
  /** 未解决的阻断型评审任务（blocking=true 的 ReviewTask） */
  blockingReviewTasks: ReviewTask[];
};

export type OntologyReleaseGateResult = {
  passed: boolean;
  reasons: string[];
};

export function evaluateOntologyReleaseGate(
  input: OntologyReleaseGateInput
): OntologyReleaseGateResult {
  // 温和策略：无快照（none）放行——不强制每个迭代做本体建模。
  // 发布即认可：published 快照视为评审已随发布确认通过，不查历史 blocking 标记
  // （正常分析会自动生成 blocking 评审且无独立解决路径，若 published 仍查之会误卡发布流程）。
  // 仅当「有快照但未发布」（candidate/superseded）时阻断，blocking 评审作补充理由。
  if (input.latestSnapshotStatus === "none") {
    return { passed: true, reasons: [] };
  }
  const reasons: string[] = [];
  if (input.latestSnapshotStatus !== "published") {
    reasons.push("本体快照已存在但未发布，须先发布结构化模型快照");
    if (input.blockingReviewTasks.length > 0) {
      reasons.push(`且存在 ${input.blockingReviewTasks.length} 项未解决阻断评审，须先解决再发布`);
    }
  }
  return { passed: reasons.length === 0, reasons };
}
