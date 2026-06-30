import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse,
  IterationDeliveryPackageResult
} from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId, FullCycleStepState } from '../../../domain/workspace/iterationTypes';
import type { AgentRunner } from '../shared/agentRunner';
import { writeAuditLog } from '../shared/common';
import { evaluatePolicyGateForFullCycleOp, appendPolicyExecutionLogOp } from '../governance/policyOps';
import { markCodeArtifactsStaleOp } from '../changeControl/artifactOps';
import type { ProjectPolicyRecord } from '../../../domain/workspace/types';
import type { ChangeImpactResult } from '../../../domain/workspace/changeImpactDetection';
import type { OntologyReleaseGateResult } from '../../../domain/continuousModeling/ontologyReleaseGate';
import { executeStep } from './fullCycleSteps';
import { STEP_ORDER, STEP_LABELS } from './fullCycleStepConfig';
import {
  initCheckpoint,
  persistCheckpoint,
  checkPreconditions,
  checkBlockedArtifactForStep,
  syncArtifactForStep,
  buildResponseFromCheckpoint,
  shouldSkipStep,
  handleBlockedStep,
  type FullCycleResultAccumulator,
  type FullCycleFlags
} from './fullCycleCheckpointOps';

type PublishResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  blockers?: string[];
};

export type { BuildResponseFn, FullCycleFlags } from './fullCycleCheckpointOps';
export { STEP_LABELS } from './fullCycleStepConfig';

export type FullCycleRunParams = {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner | null;
  iterationId: number;
  input: IterationFullCycleRunInput;
  analyzeAttachment: (iterationId: number, input: AttachmentUploadInput) => Promise<AttachmentAnalysisReport | null>;
  confirmIterationAnalysis: (
    iterationId: number,
    input: {
      accurate: boolean;
      note?: string;
      actor?: string;
      force?: boolean;
      resolvedClarificationQuestions?: string[];
      boundary?: { requirementRefs: string[]; componentRefs: string[]; codePaths: string[]; note: string };
    }
  ) => { ok: boolean; reason?: string; unresolvedQuestions?: string[]; quality?: { score?: number; summary?: string } };
  rewriteCodeInBoundary: (
    iterationId: number,
    input: { instruction: string; dryRun?: boolean; maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" }
  ) => Promise<IterationFullCycleRunResponse["rewriteResult"]>;
  generateIterationTestArtifacts: (iterationId: number, input: { dryRun?: boolean }) => Promise<IterationTestArtifactsGenerationResponse | null>;
  getIterationReleaseReview: (iterationId: number) => IterationReleaseReviewResponse | null;
  generateIterationDeliveryPackage: (
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null }
  ) => Promise<IterationDeliveryPackageResult | null>;
  publishIterationToRemote: (
    iterationId: number,
    input: { dryRun?: boolean; openPr?: boolean; commitMessage?: string; prTitle?: string; prBody?: string }
  ) => Promise<PublishResult>;
  /** 可选取消信号：步骤边界检查，true 时停止后续步骤并保留 checkpoint 供续跑 */
  shouldCancel?: () => boolean;
  /** 项目生效策略，供 fullCycle 步骤推进前做分级门禁评估；null/缺省则仅查 stale 制品 */
  activePolicy?: ProjectPolicyRecord | null;
  /** T7b: changeImpact 检测 delegate（改写步骤后检测对本体的实时影响）；缺省则不检测 */
  detectChangeImpact?: (iterationId: number, message: string) => ChangeImpactResult;
  /** T2b: 本体发布门禁 delegate（delivery-package 步骤前检查本体快照已发布且无阻断评审；温和：无快照放行，缺 delegate 不阻断） */
  evaluateOntologyGate?: (iterationId: number) => OntologyReleaseGateResult;
};

function resolveFullCycleFlags(input: IterationFullCycleRunInput): FullCycleFlags {
  return {
    runAnalysis: input.runAnalysis !== false,
    autoConfirm: input.autoConfirmAnalysis !== false,
    generateTestArtifacts: input.generateTestArtifacts !== false,
    refreshReleaseReview: input.refreshReleaseReview !== false,
    generateDeliveryPackage: input.generateDeliveryPackage !== false,
    publishEnabled: input.publish?.enabled !== false
  };
}

async function executeStepLoop(
  params: FullCycleRunParams,
  checkpoint: FullCycleCheckpoint,
  flags: FullCycleFlags,
  results: FullCycleResultAccumulator,
  blockers: string[],
  warnings: string[]
): Promise<IterationFullCycleRunResponse | null> {
  const { repo, iterationId, input } = params;
  for (let i = 0; i < STEP_ORDER.length; i++) {
    const stepId = STEP_ORDER[i];
    if (!stepId) continue;
    const stepState = checkpoint.steps[stepId];
    if (stepState.status === "completed") continue;

    if (params.shouldCancel?.()) {
      checkpoint.currentStep = stepId;
      checkpoint.resumable = true;
      checkpoint.lastUpdatedAt = new Date().toISOString();
      persistCheckpoint(repo, iterationId, checkpoint);
      writeAuditLog(repo, "fullcycle.cancelled", `iteration:${iterationId}`, `cancelled_at=${stepId}`);
      return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
    }

    const skipReason = shouldSkipStep(stepId, flags);
    if (skipReason) {
      stepState.status = "completed";
      stepState.note = skipReason;
      stepState.completedAt = new Date().toISOString();
      continue;
    }

    const freshIteration = repo.findIteration(iterationId);
    if (!freshIteration) { blockers.push("迭代不存在"); break; }
    const missing = checkPreconditions(stepId, freshIteration, checkpoint);
    if (missing.length > 0) {
      return handleBlockedStep(stepId, stepState, missing, checkpoint, repo, iterationId, blockers, warnings, results);
    }

    // policyGate 分级门禁：blocking(stale/缺必要制品/首版报告未确认)阻断该步；advisory(缺人工确认)记审计不阻断，与 fullCycle 全自动模式定位一致
    const gateEval = evaluatePolicyGateForFullCycleOp(repo, freshIteration, params.activePolicy ?? null);
    for (const advisory of gateEval.advisory) {
      appendPolicyExecutionLogOp(repo, {
        projectId: freshIteration.projectId,
        iterationId,
        policyVersion: params.activePolicy?.version ?? 0,
        stage: advisory.stage,
        action: "fullcycle_gate_check",
        result: "advisory_skipped",
        evidence: [advisory.reason, ...advisory.requiredActions]
      });
    }
    if (gateEval.blocking) {
      const blocking = gateEval.blocking;
      appendPolicyExecutionLogOp(repo, {
        projectId: freshIteration.projectId,
        iterationId,
        policyVersion: params.activePolicy?.version ?? 0,
        stage: blocking.stage,
        action: "fullcycle_gate_check",
        result: "blocked",
        evidence: [blocking.reason, ...blocking.requiredActions]
      });
      blockers.push(`门禁阻断：${blocking.reason}`);
      return handleBlockedStep(
        stepId, stepState, [blocking.reason, ...blocking.requiredActions],
        checkpoint, repo, iterationId, blockers, warnings, results, "门禁阻断"
      );
    }

    // T6 反向互查：coach 手动标 blocked 的 artifact，fullCycle 推进时尊重阻断（全自动场景 gateStatus 多 passed，blocked 仅 coach 手动标）
    const blockedArtifactReason = checkBlockedArtifactForStep(stepId, freshIteration);
    if (blockedArtifactReason) {
      appendPolicyExecutionLogOp(repo, {
        projectId: freshIteration.projectId,
        iterationId,
        policyVersion: params.activePolicy?.version ?? 0,
        stage: freshIteration.changeControl?.artifactWorkflow?.activeStage || "clarification",
        action: "fullcycle_artifact_gate_check",
        result: "blocked",
        evidence: [blockedArtifactReason]
      });
      blockers.push(`制品门禁阻断：${blockedArtifactReason}`);
      return handleBlockedStep(stepId, stepState, [blockedArtifactReason], checkpoint, repo, iterationId, blockers, warnings, results, "制品门禁阻断");
    }

    // T2b 本体发布门禁：delivery-package 步骤前检查本体快照已发布且无阻断评审（温和：无快照放行，缺 delegate 不阻断）
    if (stepId === "delivery-package" && params.evaluateOntologyGate) {
      const gate = params.evaluateOntologyGate(iterationId);
      if (!gate.passed) {
        appendPolicyExecutionLogOp(repo, {
          projectId: freshIteration.projectId,
          iterationId,
          policyVersion: params.activePolicy?.version ?? 0,
          stage: freshIteration.changeControl?.artifactWorkflow?.activeStage || "release",
          action: "fullcycle_ontology_gate_check",
          result: "blocked",
          evidence: gate.reasons
        });
        blockers.push(`本体门禁阻断：${gate.reasons.join("；")}`);
        return handleBlockedStep(stepId, stepState, gate.reasons, checkpoint, repo, iterationId, blockers, warnings, results, "本体门禁阻断");
      }
    }

    checkpoint.currentStep = stepId;
    checkpoint.lastUpdatedAt = new Date().toISOString();

    const earlyReturn = await executeSingleStep(stepId, stepState, params, input, checkpoint, results, blockers, warnings);
    if (earlyReturn) return earlyReturn;

    // T6 正向同步：步骤完成后同步对应 artifact 状态（产出标记+门禁通过），与 checkpoint 双状态一致
    syncArtifactForStep(repo, iterationId, stepId);

    // T7b: 改写步骤后检测 changeImpact, 命中标代码 artifact stale 联动 T5 阻断下游
    if (params.detectChangeImpact && input.rewriteInstruction
      && (stepId === "frontend-rewrite" || stepId === "backend-rewrite" || stepId === "merge-rewrite")) {
      const impact = params.detectChangeImpact(iterationId, input.rewriteInstruction);
      if (impact.hasImpact && impact.affectedArtifacts.length > 0) {
        markCodeArtifactsStaleOp(repo, iterationId, impact.affectedArtifacts);
        warnings.push(`改写检测到变更影响：${impact.summary}`);
      }
    }

    checkpoint.lastUpdatedAt = new Date().toISOString();
    persistCheckpoint(repo, iterationId, checkpoint);
  }
  return null;
}

async function executeSingleStep(
  stepId: FullCycleStepId,
  stepState: FullCycleStepState,
  params: FullCycleRunParams,
  input: IterationFullCycleRunInput,
  checkpoint: FullCycleCheckpoint,
  results: FullCycleResultAccumulator,
  blockers: string[],
  warnings: string[]
): Promise<IterationFullCycleRunResponse | null> {
  const { repo, iterationId } = params;
  try {
    await executeStep(stepId, params, input, checkpoint, results, blockers, warnings, buildResponseFromCheckpoint);
    if (stepState.status === "blocked" || stepState.status === "failed") {
      checkpoint.resumable = stepState.retryable;
      checkpoint.lastUpdatedAt = new Date().toISOString();
      persistCheckpoint(repo, iterationId, checkpoint);
      writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `${stepState.status}_at=${stepId}`);
      return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
    }
    stepState.status = "completed";
    stepState.completedAt = new Date().toISOString();
    return null;
  } catch (err) {
    stepState.status = "failed";
    stepState.failedAt = new Date().toISOString();
    stepState.note = err instanceof Error ? err.message : "执行失败";
    stepState.retryable = true;
    checkpoint.resumable = true;
    checkpoint.lastUpdatedAt = new Date().toISOString();
    persistCheckpoint(repo, iterationId, checkpoint);
    blockers.push(`${STEP_LABELS[stepId]}失败：${stepState.note}`);
    writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `failed_at=${stepId};error=${stepState.note.slice(0, 120)}`);
    return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
  }
}

// ── Main entry point ──

export async function runIterationFullCycleOp(params: FullCycleRunParams): Promise<IterationFullCycleRunResponse | null> {
  const { repo, iterationId, input } = params;
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;

  const now = new Date().toISOString();
  const blockers: string[] = [];
  const warnings: string[] = [];
  const flags = resolveFullCycleFlags(input);
  const results: FullCycleResultAccumulator = {
    analysisReport: null, rewriteResult: null, rewriteRuns: [], testArtifactsResult: null,
    releaseReview: null, deliveryPackageResult: null, publishResult: null
  };

  const existingCheckpoint = iteration.changeControl?.fullCycleCheckpoint;
  const checkpoint: FullCycleCheckpoint = (existingCheckpoint?.resumable)
    ? { ...existingCheckpoint, lastUpdatedAt: now }
    : initCheckpoint(now);

  try {
    const earlyReturn = await executeStepLoop(params, checkpoint, flags, results, blockers, warnings);
    if (earlyReturn) return earlyReturn;

    checkpoint.completedAt = new Date().toISOString();
    checkpoint.currentStep = null;
    checkpoint.resumable = false;
    checkpoint.lastUpdatedAt = checkpoint.completedAt;
    persistCheckpoint(repo, iterationId, checkpoint);
    writeAuditLog(repo, "fullcycle.executed", `iteration:${iterationId}`, `status=completed;warnings=${warnings.length}`);
    return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);

  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "全流程执行失败");
    checkpoint.resumable = true;
    checkpoint.lastUpdatedAt = new Date().toISOString();
    persistCheckpoint(repo, iterationId, checkpoint);
    writeAuditLog(repo, "fullcycle.executed", `iteration:${iterationId}`, `status=failed;error=${blockers[blockers.length - 1]?.slice(0, 120)}`);
    return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
  }
}
