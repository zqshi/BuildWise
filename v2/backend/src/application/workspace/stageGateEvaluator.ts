/**
 * StageGateEvaluator — 确定性门禁评估器
 *
 * 职责：
 * 1. 评估当前阶段是否有阻断（stale artifacts / 未完成门禁）
 * 2. 评估当前阶段的出口条件是否已满足
 *
 * 纯函数，不依赖 LLM，不修改状态。
 */

import type { Iteration, IterationArtifactStage, IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import { artifactStageOrder } from "./workspaceServiceChangeControlArtifactWorkflow";

// ── Public types ──

export type StageGateResult = {
  /** 当前阶段出口条件是否全部满足 */
  canProceed: boolean;
  /** 是否存在阻断（stale / 门禁未通过） */
  blocked: boolean;
  /** 当前 activeStage */
  currentStage: IterationArtifactStage;
  /** 人类可读的阻断原因 */
  blockers: string[];
  /** 当前阶段或更早阶段的 stale artifacts */
  staleArtifacts: string[];
  /** 当前阶段尚未 ready 的 artifacts */
  missingArtifacts: string[];
  /** 需要人工确认但未确认的 artifacts */
  missingConfirmations: string[];
};

export type StageExitResult = {
  /** 出口条件是否全部满足 */
  satisfied: boolean;
  /** 尚未满足的出口条件 */
  remaining: string[];
};

// ── Stage exit conditions definition ──
// 每个阶段的出口条件：哪些 artifact 必须 ready + confirmed

type StageExitCondition = {
  /** 本阶段必须 ready 的 artifact ids */
  requiredReady: string[];
  /** 本阶段必须有人工确认的 artifact ids */
  requiredConfirmed: string[];
  /** 本阶段是否需要 changeControl.confirmedAt（分析确认） */
  requireAnalysisConfirmed: boolean;
  /** 本阶段是否需要边界锁定 */
  requireBoundaryLocked: boolean;
};

const STAGE_EXIT_CONDITIONS: Record<IterationArtifactStage, StageExitCondition> = {
  clarification: {
    requiredReady: ["analysis-report"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: true,
    requireBoundaryLocked: false
  },
  scope: {
    requiredReady: ["boundary-confirmation"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: true
  },
  interaction: {
    // 原型和设计规范不是所有项目都需要，不硬性要求
    requiredReady: [],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: false
  },
  development: {
    requiredReady: ["technical-architecture"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: false
  },
  testing: {
    requiredReady: ["test-matrix"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: false
  },
  release: {
    requiredReady: ["release-review"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: false
  },
  archive: {
    requiredReady: ["delivery-package"],
    requiredConfirmed: [],
    requireAnalysisConfirmed: false,
    requireBoundaryLocked: false
  }
};

// ── Helpers ──

function getWorkflowItems(iteration: Iteration): IterationArtifactWorkflowItem[] {
  return iteration.changeControl?.artifactWorkflow?.items ?? [];
}

function getActiveStage(iteration: Iteration): IterationArtifactStage {
  return iteration.changeControl?.artifactWorkflow?.activeStage || "clarification";
}

function isArtifactReady(items: IterationArtifactWorkflowItem[], artifactId: string): boolean {
  return items.some((item) => item.id === artifactId && item.status === "ready");
}

function isArtifactConfirmed(items: IterationArtifactWorkflowItem[], artifactId: string): boolean {
  return items.some(
    (item) => item.id === artifactId && item.lastConfirmedAt !== "" && item.lastConfirmedBy !== ""
  );
}

function isAnalysisConfirmed(iteration: Iteration): boolean {
  return !!(iteration.changeControl?.confirmedAt);
}

function isBoundaryLocked(iteration: Iteration): boolean {
  const boundary = iteration.changeControl?.boundary;
  return !!(
    boundary &&
    boundary.requirementRefs.length > 0 &&
    boundary.updatedAt
  );
}

function findStaleInCurrentOrEarlier(
  items: IterationArtifactWorkflowItem[],
  currentStage: IterationArtifactStage
): IterationArtifactWorkflowItem[] {
  const currentIndex = artifactStageOrder.indexOf(currentStage);
  return items.filter((item) => {
    if (!item.stale) return false;
    const itemIndex = artifactStageOrder.indexOf(item.stage);
    return itemIndex <= currentIndex;
  });
}

// ── Public API ──

/**
 * 评估当前阶段的门禁状态：是否有阻断需要先处理。
 * 不修改任何状态，纯计算。
 */
export function evaluateCurrentStageGate(iteration: Iteration): StageGateResult {
  const currentStage = getActiveStage(iteration);
  const items = getWorkflowItems(iteration);
  const blockers: string[] = [];
  const staleArtifacts: string[] = [];
  const missingArtifacts: string[] = [];
  const missingConfirmations: string[] = [];

  // 1. Stale artifact 阻断：当前阶段或更早阶段有 stale 的 artifact
  const staleItems = findStaleInCurrentOrEarlier(items, currentStage);
  for (const item of staleItems) {
    staleArtifacts.push(item.title);
    blockers.push(`「${item.title}」需要同步更新（上游变更导致过时）`);
  }

  // 2. 当前阶段 gate 被标记为 blocked 的 artifact
  const currentStageItems = items.filter((item) => item.stage === currentStage);
  for (const item of currentStageItems) {
    if (item.gateStatus === "blocked") {
      blockers.push(`「${item.title}」门禁被阻断`);
    }
  }

  const blocked = blockers.length > 0;

  // 3. 计算当前阶段缺失的 artifact（用于提示，非阻断）
  const exitCondition = STAGE_EXIT_CONDITIONS[currentStage];
  for (const artifactId of exitCondition.requiredReady) {
    if (!isArtifactReady(items, artifactId)) {
      const item = items.find((i) => i.id === artifactId);
      missingArtifacts.push(item?.title || artifactId);
    }
  }
  for (const artifactId of exitCondition.requiredConfirmed) {
    if (!isArtifactConfirmed(items, artifactId)) {
      const item = items.find((i) => i.id === artifactId);
      missingConfirmations.push(item?.title || artifactId);
    }
  }

  // 4. 出口条件评估
  const exitResult = evaluateStageExitConditions(iteration, currentStage);

  return {
    canProceed: exitResult.satisfied,
    blocked,
    currentStage,
    blockers,
    staleArtifacts,
    missingArtifacts,
    missingConfirmations
  };
}

/**
 * 评估指定阶段的出口条件是否全部满足。
 * 满足时 Orchestrator 可以自动推进到下一阶段。
 */
export function evaluateStageExitConditions(
  iteration: Iteration,
  stage: IterationArtifactStage
): StageExitResult {
  const items = getWorkflowItems(iteration);
  const condition = STAGE_EXIT_CONDITIONS[stage];
  const remaining: string[] = [];

  // 检查 requiredReady
  for (const artifactId of condition.requiredReady) {
    if (!isArtifactReady(items, artifactId)) {
      const item = items.find((i) => i.id === artifactId);
      remaining.push(`${item?.title || artifactId} 尚未就绪`);
    }
  }

  // 检查 requiredConfirmed
  for (const artifactId of condition.requiredConfirmed) {
    if (!isArtifactConfirmed(items, artifactId)) {
      const item = items.find((i) => i.id === artifactId);
      remaining.push(`${item?.title || artifactId} 尚未确认`);
    }
  }

  // 检查分析确认
  if (condition.requireAnalysisConfirmed && !isAnalysisConfirmed(iteration)) {
    remaining.push("分析报告尚未确认");
  }

  // 检查边界锁定
  if (condition.requireBoundaryLocked && !isBoundaryLocked(iteration)) {
    remaining.push("变更边界尚未锁定");
  }

  // 检查 stale
  const staleInStage = items.filter((item) => item.stage === stage && item.stale);
  if (staleInStage.length > 0) {
    remaining.push(`${staleInStage.map((i) => i.title).join("、")} 已过时需更新`);
  }

  return {
    satisfied: remaining.length === 0,
    remaining
  };
}

/**
 * 获取当前阶段的下一个阶段，如果已是最后阶段则返回 null。
 */
export function getNextStage(currentStage: IterationArtifactStage): IterationArtifactStage | null {
  const index = artifactStageOrder.indexOf(currentStage);
  if (index < 0 || index >= artifactStageOrder.length - 1) {
    return null;
  }
  return artifactStageOrder[index + 1]!;
}
