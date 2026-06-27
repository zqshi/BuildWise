import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationDeliveryPackageResult,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId, FullCycleStepState } from '../../../domain/workspace/iterationTypes';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import { syncArtifactForFullCycleStepOp } from '../changeControl/artifactOps';
import type { FullCycleStepResults } from './fullCycleSteps';
import { STEP_ORDER, STEP_ARTIFACT_MAP, STEP_PRECONDITIONS } from './fullCycleStepConfig';

// ── Checkpoint helpers ──

export function initStepState(): FullCycleStepState {
  return {
    status: "pending",
    note: "",
    completedAt: "",
    failedAt: "",
    missingPreconditions: [],
    retryable: false
  };
}

export function initCheckpoint(now: string): FullCycleCheckpoint {
  const steps = {} as Record<FullCycleStepId, FullCycleStepState>;
  for (const stepId of STEP_ORDER) {
    steps[stepId] = initStepState();
  }
  return {
    startedAt: now,
    lastUpdatedAt: now,
    steps,
    currentStep: null,
    resumable: false,
    completedAt: ""
  };
}

export function persistCheckpoint(repo: WorkspaceRepository, iterationId: number, checkpoint: FullCycleCheckpoint) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return;
  const cc = iteration.changeControl ?? defaultIterationChangeControl();
  iteration.changeControl = { ...cc, fullCycleCheckpoint: checkpoint };
  repo.updateIteration(iteration);
}

export function checkPreconditions(
  stepId: FullCycleStepId,
  iteration: Iteration,
  checkpoint: FullCycleCheckpoint
): string[] {
  const preconditions = STEP_PRECONDITIONS[stepId];
  return preconditions
    .filter(p => !p.check(iteration, checkpoint))
    .map(p => p.description);
}

/** T6 反向互查：coach 手动标 blocked 的 artifact，fullCycle 推进该步时尊重阻断。返回阻断原因或 null。 */
export function checkBlockedArtifactForStep(stepId: FullCycleStepId, iteration: Iteration): string | null {
  const artifactIds = STEP_ARTIFACT_MAP[stepId] ?? [];
  if (artifactIds.length === 0) return null;
  const items = iteration.changeControl?.artifactWorkflow?.items ?? [];
  for (const id of artifactIds) {
    const item = items.find((i) => i.id === id);
    if (item?.gateStatus === "blocked") {
      return `制品「${item.title || id}」被门禁阻断`;
    }
  }
  return null;
}

/** T6 正向同步：步骤完成后同步对应 artifact 状态（产出标记+门禁通过），与 checkpoint 双状态一致。 */
export function syncArtifactForStep(repo: WorkspaceRepository, iterationId: number, stepId: FullCycleStepId): void {
  const artifactIds = STEP_ARTIFACT_MAP[stepId] ?? [];
  if (artifactIds.length === 0) return;
  syncArtifactForFullCycleStepOp(repo, iterationId, artifactIds);
}

/**
 * Map checkpoint state to the legacy IterationFullCycleRunResponse format
 * so the frontend can consume it without breaking changes.
 */
export function buildResponseFromCheckpoint(
  iterationId: number,
  checkpoint: FullCycleCheckpoint,
  blockers: string[],
  warnings: string[],
  results: {
    analysisReport: AttachmentAnalysisReport | null;
    rewriteResult: IterationFullCycleRunResponse["rewriteResult"];
    testArtifactsResult: IterationTestArtifactsGenerationResponse | null;
    releaseReview: IterationReleaseReviewResponse | null;
    deliveryPackageResult: IterationDeliveryPackageResult | null;
    publishResult: IterationFullCycleRunResponse["publishResult"];
  }
): IterationFullCycleRunResponse {
  const mapStatus = (state: FullCycleStepState): "completed" | "skipped" | "failed" | "blocked" => {
    if (state.status === "pending") return "skipped";
    return state.status;
  };
  const mapStatusNoBlock = (state: FullCycleStepState): "completed" | "skipped" | "failed" => {
    if (state.status === "pending") return "skipped";
    if (state.status === "blocked") return "failed";
    return state.status;
  };

  const hasFailed = STEP_ORDER.some(s => checkpoint.steps[s].status === "failed");
  const hasBlocked = STEP_ORDER.some(s => checkpoint.steps[s].status === "blocked");
  const hasPending = STEP_ORDER.some(s => checkpoint.steps[s].status === "pending");
  let status: IterationFullCycleRunResponse["status"];
  if (hasFailed) status = "failed";
  else if (hasBlocked) status = "blocked";
  else if (hasPending || warnings.length > 0) status = "partial";
  else status = "completed";

  return {
    iterationId,
    startedAt: checkpoint.startedAt,
    finishedAt: checkpoint.lastUpdatedAt,
    status,
    steps: {
      analysis: { status: mapStatusNoBlock(checkpoint.steps.analysis), note: checkpoint.steps.analysis.note },
      confirmation: { status: mapStatus(checkpoint.steps.confirmation), note: checkpoint.steps.confirmation.note },
      frontendRewrite: { status: mapStatus(checkpoint.steps["frontend-rewrite"]), note: checkpoint.steps["frontend-rewrite"].note },
      backendRewrite: { status: mapStatus(checkpoint.steps["backend-rewrite"]), note: checkpoint.steps["backend-rewrite"].note },
      rewrite: { status: mapStatus(checkpoint.steps["merge-rewrite"]), note: checkpoint.steps["merge-rewrite"].note },
      testArtifacts: { status: mapStatusNoBlock(checkpoint.steps["test-artifacts"]), note: checkpoint.steps["test-artifacts"].note },
      releaseReview: { status: mapStatusNoBlock(checkpoint.steps["release-review"]), note: checkpoint.steps["release-review"].note },
      deliveryPackage: { status: mapStatusNoBlock(checkpoint.steps["delivery-package"]), note: checkpoint.steps["delivery-package"].note },
      publish: { status: mapStatus(checkpoint.steps.publish), note: checkpoint.steps.publish.note }
    },
    blockers,
    warnings,
    analysisReport: results.analysisReport,
    rewriteResult: results.rewriteResult,
    testArtifactsResult: results.testArtifactsResult,
    releaseReview: results.releaseReview,
    deliveryPackageResult: results.deliveryPackageResult,
    publishResult: results.publishResult,
    checkpoint
  };
}

export type FullCycleResultAccumulator = FullCycleStepResults;

export type BuildResponseFn = typeof buildResponseFromCheckpoint;

export type FullCycleFlags = {
  runAnalysis: boolean;
  autoConfirm: boolean;
  generateTestArtifacts: boolean;
  refreshReleaseReview: boolean;
  generateDeliveryPackage: boolean;
  publishEnabled: boolean;
};

export function shouldSkipStep(stepId: FullCycleStepId, flags: FullCycleFlags): string | null {
  if (stepId === "analysis" && !flags.runAnalysis) return "按参数跳过分析。";
  if (stepId === "confirmation" && !flags.autoConfirm) return "按参数跳过自动确认。";
  if (stepId === "test-artifacts" && !flags.generateTestArtifacts) return "按参数跳过测试产物生成。";
  if (stepId === "release-review" && !flags.refreshReleaseReview) return "按参数跳过发布评审刷新。";
  if (stepId === "delivery-package" && !flags.generateDeliveryPackage) return "按参数跳过交付包生成。";
  if (stepId === "publish" && !flags.publishEnabled) return "按参数跳过发布。";
  return null;
}

export function handleBlockedStep(
  stepId: FullCycleStepId,
  stepState: FullCycleStepState,
  missing: string[],
  checkpoint: FullCycleCheckpoint,
  repo: WorkspaceRepository,
  iterationId: number,
  blockers: string[],
  warnings: string[],
  results: FullCycleResultAccumulator,
  notePrefix = "前置条件不满足"
): IterationFullCycleRunResponse {
  stepState.status = "blocked";
  stepState.note = `${notePrefix}：${missing.join("；")}`;
  stepState.missingPreconditions = missing;
  stepState.retryable = true;
  checkpoint.currentStep = stepId;
  checkpoint.resumable = true;
  checkpoint.lastUpdatedAt = new Date().toISOString();
  persistCheckpoint(repo, iterationId, checkpoint);
  writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `blocked_at=${stepId};missing=${missing.join(",")}`);
  return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
}
