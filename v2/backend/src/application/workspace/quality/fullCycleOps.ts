import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  Iteration,
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId, FullCycleStepState } from '../../../domain/workspace/iterationTypes';
import type { AgentRunner } from '../shared/agentRunner';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import { evaluatePolicyGateForFullCycleOp, appendPolicyExecutionLogOp } from '../governance/policyOps';
import type { ProjectPolicyRecord } from '../../../domain/workspace/types';
import { executeStep, type FullCycleStepResults } from './fullCycleSteps';

type PublishResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  blockers?: string[];
};

// ── Step labels for user-facing messages ──

const STEP_LABELS: Record<FullCycleStepId, string> = {
  "analysis": "材料分析",
  "confirmation": "分析确认",
  "ux-guidance": "UX 执行指引",
  "frontend-rewrite": "前端改写",
  "backend-rewrite": "后端改写",
  "merge-rewrite": "改写合并",
  "test-artifacts": "测试产物",
  "release-review": "发布评审",
  "delivery-package": "交付包生成",
  "publish": "发布"
};

// ── Step execution order ──

const STEP_ORDER: FullCycleStepId[] = [
  "analysis",
  "confirmation",
  "ux-guidance",
  "frontend-rewrite",
  "backend-rewrite",
  "merge-rewrite",
  "test-artifacts",
  "release-review",
  "delivery-package",
  "publish"
];

// ── Preconditions for each step ──

type StepPrecondition = {
  check: (iteration: Iteration, checkpoint: FullCycleCheckpoint) => boolean;
  description: string;
};

const STEP_PRECONDITIONS: Record<FullCycleStepId, StepPrecondition[]> = {
  "analysis": [
    // analysis 需要有上传材料或继承基线；如果调用方指定 runAnalysis=false 则跳过，不在此处检查
  ],
  "confirmation": [
    {
      check: (it) => !!it.changeControl?.lastAnalysisAt,
      description: "分析尚未完成"
    }
  ],
  "ux-guidance": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => {
        // 检查分析中是否已提取出领域知识（本体非空才能生成有意义的 UX 指引）
        const entries = it.changeControl?.domainKnowledgeEntries;
        return Array.isArray(entries) && entries.length > 0;
      },
      description: "本体中无领域知识条目，无法生成有意义的 UX 指引"
    }
  ],
  "frontend-rewrite": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.requirementRefs?.length),
      description: "边界尚未锁定"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.codePaths?.length),
      description: "边界中无代码路径"
    }
  ],
  "backend-rewrite": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.requirementRefs?.length),
      description: "边界尚未锁定"
    },
    {
      check: (it) => !!(it.changeControl?.boundary?.codePaths?.length),
      description: "边界中无代码路径"
    }
  ],
  "merge-rewrite": [
    {
      check: (_it, cp) => {
        return cp.steps["frontend-rewrite"].status === "completed"
            || cp.steps["backend-rewrite"].status === "completed";
      },
      description: "前端和后端改写均未完成"
    }
  ],
  "test-artifacts": [
    {
      check: (it) => !!it.changeControl?.confirmedAt,
      description: "分析尚未确认"
    },
    {
      check: (it) => {
        const ts = it.changeControl?.traceabilitySnapshot;
        if (!ts) return false;
        const coverage = ts.requirementCoverage ?? 0;
        return coverage > 0;
      },
      description: "需求追溯覆盖率为 0，无法生成有效测试产物"
    }
  ],
  "release-review": [
    {
      check: (it) => !!it.changeControl?.lastAnalysisAt,
      description: "分析尚未完成"
    },
    {
      check: (it) => {
        const matrix = it.changeControl?.generatedTestMatrix;
        if (!Array.isArray(matrix) || matrix.length === 0) return true; // 无测试矩阵时不阻断
        return matrix.some((tc) => tc.executionStatus === "passed");
      },
      description: "测试矩阵中无通过用例，发布评审缺少质量证据"
    }
  ],
  "delivery-package": [
    {
      check: (_it, cp) => cp.steps["release-review"].status === "completed",
      description: "发布评审尚未完成"
    },
    {
      check: (it) => it.changeControl?.lastReleaseReviewDecision !== "block",
      description: "发布评审结论为阻塞，不允许生成交付包"
    }
  ],
  "publish": [
    {
      check: (_it, cp) => cp.steps["delivery-package"].status === "completed",
      description: "交付包尚未生成"
    }
  ]
};

// ── Checkpoint helpers ──

function initStepState(): FullCycleStepState {
  return {
    status: "pending",
    note: "",
    completedAt: "",
    failedAt: "",
    missingPreconditions: [],
    retryable: false
  };
}

function initCheckpoint(now: string): FullCycleCheckpoint {
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

function persistCheckpoint(repo: WorkspaceRepository, iterationId: number, checkpoint: FullCycleCheckpoint) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return;
  const cc = iteration.changeControl ?? defaultIterationChangeControl();
  iteration.changeControl = { ...cc, fullCycleCheckpoint: checkpoint };
  repo.updateIteration(iteration);
}

function checkPreconditions(
  stepId: FullCycleStepId,
  iteration: Iteration,
  checkpoint: FullCycleCheckpoint
): string[] {
  const preconditions = STEP_PRECONDITIONS[stepId];
  return preconditions
    .filter(p => !p.check(iteration, checkpoint))
    .map(p => p.description);
}

/**
 * Map checkpoint state to the legacy IterationFullCycleRunResponse format
 * so the frontend can consume it without breaking changes.
 */
function buildResponseFromCheckpoint(
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

function shouldSkipStep(stepId: FullCycleStepId, flags: FullCycleFlags): string | null {
  if (stepId === "analysis" && !flags.runAnalysis) return "按参数跳过分析。";
  if (stepId === "confirmation" && !flags.autoConfirm) return "按参数跳过自动确认。";
  if (stepId === "test-artifacts" && !flags.generateTestArtifacts) return "按参数跳过测试产物生成。";
  if (stepId === "release-review" && !flags.refreshReleaseReview) return "按参数跳过发布评审刷新。";
  if (stepId === "delivery-package" && !flags.generateDeliveryPackage) return "按参数跳过交付包生成。";
  if (stepId === "publish" && !flags.publishEnabled) return "按参数跳过发布。";
  return null;
}

function handleBlockedStep(
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

type FullCycleResultAccumulator = FullCycleStepResults;

export type BuildResponseFn = typeof buildResponseFromCheckpoint;

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
};

type FullCycleFlags = {
  runAnalysis: boolean;
  autoConfirm: boolean;
  generateTestArtifacts: boolean;
  refreshReleaseReview: boolean;
  generateDeliveryPackage: boolean;
  publishEnabled: boolean;
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
    const stepId = STEP_ORDER[i]!;
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

    checkpoint.currentStep = stepId;
    checkpoint.lastUpdatedAt = new Date().toISOString();

    const earlyReturn = await executeSingleStep(stepId, stepState, params, input, checkpoint, results, blockers, warnings);
    if (earlyReturn) return earlyReturn;

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

export { STEP_LABELS };

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

