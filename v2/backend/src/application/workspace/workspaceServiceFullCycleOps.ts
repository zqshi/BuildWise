import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  Iteration,
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from "../../domain/workspace/types";
import type { FullCycleCheckpoint, FullCycleStepId, FullCycleStepState } from "../../domain/workspace/iterationTypes";
import type { AgentRunner } from "./agentRunner";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { runFullCycleFinalizeOps } from "./workspaceServiceFullCycleFinalizeOps";
import { mergeRewriteResults } from "./attachmentOps";
import { generateUxExecutionGuidanceOp } from "./workspaceMiscOps";

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

// ── Main entry point ──

export { STEP_LABELS };

export async function runIterationFullCycleOp(params: {
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
      boundary?: {
        requirementRefs: string[];
        componentRefs: string[];
        codePaths: string[];
        note: string;
      };
    }
  ) => {
    ok: boolean;
    reason?: string;
    unresolvedQuestions?: string[];
    quality?: { score?: number; summary?: string };
  };
  rewriteCodeInBoundary: (
    iterationId: number,
    input: {
      instruction: string;
      dryRun?: boolean;
      maxFiles?: number;
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ) => Promise<IterationFullCycleRunResponse["rewriteResult"]>;
  generateIterationTestArtifacts: (
    iterationId: number,
    input: { dryRun?: boolean }
  ) => Promise<IterationTestArtifactsGenerationResponse | null>;
  getIterationReleaseReview: (iterationId: number) => IterationReleaseReviewResponse | null;
  generateIterationDeliveryPackage: (
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null }
  ) => Promise<IterationDeliveryPackageResult | null>;
  publishIterationToRemote: (
    iterationId: number,
    input: {
      dryRun?: boolean;
      openPr?: boolean;
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
    }
  ) => Promise<PublishResult>;
}): Promise<IterationFullCycleRunResponse | null> {
  const { repo, agentRunner: _agentRunner, iterationId, input } = params;
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;

  const now = new Date().toISOString();
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Resolve input flags (default true)
  const runAnalysis = input.runAnalysis !== false;
  const autoConfirm = input.autoConfirmAnalysis !== false;
  const generateTestArtifacts = input.generateTestArtifacts !== false;
  const refreshReleaseReview = input.refreshReleaseReview !== false;
  const generateDeliveryPackage = input.generateDeliveryPackage !== false;
  const publishEnabled = input.publish?.enabled !== false;

  // Result accumulators
  const results: {
    analysisReport: AttachmentAnalysisReport | null;
    rewriteResult: IterationFullCycleRunResponse["rewriteResult"];
    testArtifactsResult: IterationTestArtifactsGenerationResponse | null;
    releaseReview: IterationReleaseReviewResponse | null;
    deliveryPackageResult: IterationDeliveryPackageResult | null;
    publishResult: IterationFullCycleRunResponse["publishResult"];
  } = {
    analysisReport: null,
    rewriteResult: null,
    testArtifactsResult: null,
    releaseReview: null,
    deliveryPackageResult: null,
    publishResult: null
  };

  // ── Restore or initialize checkpoint ──
  const existingCheckpoint = iteration.changeControl?.fullCycleCheckpoint;
  const checkpoint: FullCycleCheckpoint = (existingCheckpoint && existingCheckpoint.resumable)
    ? { ...existingCheckpoint, lastUpdatedAt: now }
    : initCheckpoint(now);

  try {
    for (let i = 0; i < STEP_ORDER.length; i++) {
      const stepId = STEP_ORDER[i]!;
      const stepState = checkpoint.steps[stepId];

      // ── Already completed → skip (idempotent) ──
      if (stepState.status === "completed") continue;

      // ── Check if step is disabled by input flags ──
      if (stepId === "analysis" && !runAnalysis) {
        stepState.status = "completed";
        stepState.note = "按参数跳过分析。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }
      if (stepId === "confirmation" && !autoConfirm) {
        stepState.status = "completed";
        stepState.note = "按参数跳过自动确认。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }
      if (stepId === "test-artifacts" && !generateTestArtifacts) {
        stepState.status = "completed";
        stepState.note = "按参数跳过测试产物生成。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }
      if (stepId === "release-review" && !refreshReleaseReview) {
        stepState.status = "completed";
        stepState.note = "按参数跳过发布评审刷新。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }
      if (stepId === "delivery-package" && !generateDeliveryPackage) {
        stepState.status = "completed";
        stepState.note = "按参数跳过交付包生成。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }
      if (stepId === "publish" && !publishEnabled) {
        stepState.status = "completed";
        stepState.note = "按参数跳过发布。";
        stepState.completedAt = new Date().toISOString();
        continue;
      }

      // ── Check preconditions ──
      const freshIteration = repo.findIteration(iterationId);
      if (!freshIteration) {
        blockers.push("迭代不存在");
        break;
      }
      const missing = checkPreconditions(stepId, freshIteration, checkpoint);
      if (missing.length > 0) {
        // Stop at checkpoint — do not skip, do not produce fake content
        stepState.status = "blocked";
        stepState.note = `前置条件不满足：${missing.join("；")}`;
        stepState.missingPreconditions = missing;
        stepState.retryable = true;
        checkpoint.currentStep = stepId;
        checkpoint.resumable = true;
        checkpoint.lastUpdatedAt = new Date().toISOString();
        persistCheckpoint(repo, iterationId, checkpoint);
        const response = buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
        writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `blocked_at=${stepId};missing=${missing.join(",")}`);
        return response;
      }

      // ── Execute step ──
      checkpoint.currentStep = stepId;
      checkpoint.lastUpdatedAt = new Date().toISOString();

      try {
        await executeStep(stepId, params, input, checkpoint, results, blockers, warnings);

        // If step execution set status to blocked/failed, stop here
        if (stepState.status === "blocked" || stepState.status === "failed") {
          checkpoint.resumable = stepState.retryable;
          checkpoint.lastUpdatedAt = new Date().toISOString();
          persistCheckpoint(repo, iterationId, checkpoint);
          const response = buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
          writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `${stepState.status}_at=${stepId}`);
          return response;
        }

        stepState.status = "completed";
        stepState.completedAt = new Date().toISOString();
      } catch (err) {
        stepState.status = "failed";
        stepState.failedAt = new Date().toISOString();
        stepState.note = err instanceof Error ? err.message : "执行失败";
        stepState.retryable = true;
        checkpoint.resumable = true;
        checkpoint.lastUpdatedAt = new Date().toISOString();
        persistCheckpoint(repo, iterationId, checkpoint);
        blockers.push(`${STEP_LABELS[stepId]}失败：${stepState.note}`);
        const response = buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
        writeAuditLog(repo, "fullcycle.checkpoint", `iteration:${iterationId}`, `failed_at=${stepId};error=${stepState.note.slice(0, 120)}`);
        return response;
      }

      // Persist after each step completion
      checkpoint.lastUpdatedAt = new Date().toISOString();
      persistCheckpoint(repo, iterationId, checkpoint);
    }

    // ── All steps completed ──
    checkpoint.completedAt = new Date().toISOString();
    checkpoint.currentStep = null;
    checkpoint.resumable = false;
    checkpoint.lastUpdatedAt = checkpoint.completedAt;
    persistCheckpoint(repo, iterationId, checkpoint);
    writeAuditLog(repo, "fullcycle.executed", `iteration:${iterationId}`, `status=completed;warnings=${warnings.length}`);
    return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);

  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "full cycle failed");
    checkpoint.resumable = true;
    checkpoint.lastUpdatedAt = new Date().toISOString();
    persistCheckpoint(repo, iterationId, checkpoint);
    writeAuditLog(repo, "fullcycle.executed", `iteration:${iterationId}`, `status=failed;error=${blockers[blockers.length - 1]?.slice(0, 120)}`);
    return buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
  }
}

// ── Step execution dispatcher ──

async function executeStep(
  stepId: FullCycleStepId,
  params: Parameters<typeof runIterationFullCycleOp>[0],
  input: IterationFullCycleRunInput,
  checkpoint: FullCycleCheckpoint,
  results: {
    analysisReport: AttachmentAnalysisReport | null;
    rewriteResult: IterationFullCycleRunResponse["rewriteResult"];
    testArtifactsResult: IterationTestArtifactsGenerationResponse | null;
    releaseReview: IterationReleaseReviewResponse | null;
    deliveryPackageResult: IterationDeliveryPackageResult | null;
    publishResult: IterationFullCycleRunResponse["publishResult"];
  },
  blockers: string[],
  warnings: string[]
): Promise<void> {
  const { repo, agentRunner, iterationId } = params;
  const stepState = checkpoint.steps[stepId];

  switch (stepId) {
    case "analysis": {
      if (!input.analysisInput) {
        stepState.status = "failed";
        stepState.note = "缺少 analysisInput，无法执行分析。";
        stepState.retryable = false;
        blockers.push("analysisInput is required when runAnalysis=true");
        return;
      }
      const report = await params.analyzeAttachment(iterationId, {
        ...input.analysisInput,
        agentScope: input.analysisInput.agentScope || "full-cycle"
      });
      if (!report) {
        stepState.status = "failed";
        stepState.note = "分析失败：迭代不存在或结果为空。";
        stepState.retryable = true;
        blockers.push("analysis failed");
        return;
      }
      results.analysisReport = report;
      stepState.note = `分析完成：clarification=${report.clarificationQuestions.length}`;
      return;
    }

    case "confirmation": {
      const currentIteration = repo.findIteration(iterationId);
      const currentCC = currentIteration?.changeControl ?? defaultIterationChangeControl();
      const unresolvedClarifications = Array.isArray(currentCC.clarificationQuestions) ? currentCC.clarificationQuestions : [];
      const autoResolveClarifications = input.autoResolveClarifications !== false;
      const resolvedClarificationQuestions = autoResolveClarifications ? unresolvedClarifications : [];
      const autoBoundarySource = results.analysisReport?.executableConstraints;
      const autoBoundary = autoBoundarySource
        ? {
            requirementRefs: results.analysisReport?.traceabilityMap.requirementToCode.map((item) => item.requirement).slice(0, 16) || [],
            componentRefs: autoBoundarySource.componentWhitelist,
            codePaths: autoBoundarySource.codePathWhitelist,
            note: "Auto confirmed by full-cycle executor."
          }
        : undefined;
      const confirmResult = params.confirmIterationAnalysis(iterationId, {
        accurate: true,
        note: "Auto confirmation by full-cycle executor",
        actor: "full-cycle-bot",
        resolvedClarificationQuestions,
        boundary: autoBoundary
      });
      if (!confirmResult.ok) {
        if (confirmResult.reason === "clarification_questions_unresolved") {
          stepState.status = "blocked";
          stepState.note = "存在未收敛澄清问题，自动确认被阻断。";
          stepState.retryable = true;
          blockers.push(...(confirmResult.unresolvedQuestions || []));
        } else if (confirmResult.reason === "report_not_publishable") {
          stepState.status = "blocked";
          stepState.note = `报告质量门禁阻断：${confirmResult.quality?.summary || "report_not_publishable"}`;
          stepState.retryable = true;
          blockers.push(`report_quality=${confirmResult.quality?.score || 0}`);
        } else {
          stepState.status = "failed";
          stepState.note = `自动确认失败：${confirmResult.reason || "unknown"}`;
          stepState.retryable = true;
          blockers.push(confirmResult.reason || "analysis confirmation failed");
        }
        return;
      }
      stepState.note = "分析与边界已自动确认。";
      return;
    }

    case "ux-guidance": {
      const iterationForUx = repo.findIteration(iterationId) as Iteration | null;
      const baseRewriteInstruction =
        input.rewriteInstruction?.trim() ||
        (results.analysisReport
          ? `依据需求与验收清单执行边界内增量实现：${
              results.analysisReport.businessConfirmation.necessityAssessment.mustDo.join("；") ||
              results.analysisReport.businessConfirmation.functionalPoints.slice(0, 3).join("；")
            }`
          : "依据当前迭代边界与验收清单执行增量实现");

      const uxGuidance = await generateUxExecutionGuidanceOp({
        agentRunner,
        iteration: iterationForUx,
        analysisReport: results.analysisReport,
        rewriteInstruction: baseRewriteInstruction
      });
      if (uxGuidance.warnings.length > 0) {
        warnings.push(...uxGuidance.warnings);
      }
      // Persist UX artifacts
      const iterationAfterUx = repo.findIteration(iterationId);
      const shouldPersistUxArtifacts =
        Boolean(uxGuidance.uxArtifacts?.updatedAt) ||
        (uxGuidance.uxArtifacts?.informationArchitecture.length || 0) > 0 ||
        (uxGuidance.uxArtifacts?.interactionFlows.length || 0) > 0 ||
        (uxGuidance.uxArtifacts?.uiStates.length || 0) > 0 ||
        (uxGuidance.uxArtifacts?.uxConstraints.length || 0) > 0;
      if (iterationAfterUx && uxGuidance.uxArtifacts && shouldPersistUxArtifacts) {
        iterationAfterUx.changeControl = {
          ...(iterationAfterUx.changeControl || defaultIterationChangeControl()),
          uxArtifacts: uxGuidance.uxArtifacts
        };
        repo.updateIteration(iterationAfterUx);
      }
      stepState.note = uxGuidance.guidance ? "UX 执行指引已生成。" : "UX 指引跳过（无需额外约束）。";
      return;
    }

    case "frontend-rewrite": {
      const iterForRewrite = repo.findIteration(iterationId);
      const rewriteInstruction = buildRewriteInstruction(input, iterForRewrite, results.analysisReport);
      const rewriteDryRun = input.rewriteDryRun === true;
      const rewriteMaxFiles = typeof input.rewriteMaxFiles === "number" ? input.rewriteMaxFiles : 8;
      const frontendRewrite = await params.rewriteCodeInBoundary(iterationId, {
        instruction: `前端实现要求：${rewriteInstruction}`,
        dryRun: rewriteDryRun,
        maxFiles: Math.max(3, Math.ceil(rewriteMaxFiles / 2)),
        role: "frontend-developer"
      });
      if (!frontendRewrite) {
        stepState.status = "failed";
        stepState.note = "前端改写失败：结果为空。";
        stepState.retryable = true;
        return;
      }
      if ((frontendRewrite.outOfBoundaryFiles?.length || 0) > 0) {
        stepState.status = "blocked";
        stepState.note = "前端改写存在越界文件。";
        stepState.retryable = true;
        blockers.push(...frontendRewrite.outOfBoundaryFiles.map((f) => `out_of_boundary:${f}`));
        return;
      }
      stepState.note = `${frontendRewrite.dryRun ? "dry-run" : "applied"}; edits=${frontendRewrite.edits.length}; skipped=${frontendRewrite.skippedFiles.length}`;
      return;
    }

    case "backend-rewrite": {
      const iterForRewrite = repo.findIteration(iterationId);
      const rewriteInstruction = buildRewriteInstruction(input, iterForRewrite, results.analysisReport);
      const rewriteDryRun = input.rewriteDryRun === true;
      const rewriteMaxFiles = typeof input.rewriteMaxFiles === "number" ? input.rewriteMaxFiles : 8;
      const backendRewrite = await params.rewriteCodeInBoundary(iterationId, {
        instruction: `后端实现要求：${rewriteInstruction}`,
        dryRun: rewriteDryRun,
        maxFiles: Math.max(3, Math.ceil(rewriteMaxFiles / 2)),
        role: "backend-developer"
      });
      if (!backendRewrite) {
        stepState.status = "failed";
        stepState.note = "后端改写失败：结果为空。";
        stepState.retryable = true;
        return;
      }
      if ((backendRewrite.outOfBoundaryFiles?.length || 0) > 0) {
        stepState.status = "blocked";
        stepState.note = "后端改写存在越界文件。";
        stepState.retryable = true;
        blockers.push(...backendRewrite.outOfBoundaryFiles.map((f) => `out_of_boundary:${f}`));
        return;
      }
      stepState.note = `${backendRewrite.dryRun ? "dry-run" : "applied"}; edits=${backendRewrite.edits.length}; skipped=${backendRewrite.skippedFiles.length}`;
      return;
    }

    case "merge-rewrite": {
      const rewriteDryRun = input.rewriteDryRun === true;
      // Merge is a no-op in the new model — individual rewrite results are tracked per-step.
      // We still call mergeRewriteResults for the combined response payload.
      // Since frontend/backend rewrites store results in params callbacks that update changeControl,
      // we just need to produce the merged result for the response.
      results.rewriteResult = mergeRewriteResults(iterationId, rewriteDryRun, []);
      stepState.note = "改写结果已合并。";
      return;
    }

    case "test-artifacts": {
      const artifacts = await params.generateIterationTestArtifacts(iterationId, {
        dryRun: input.testArtifactsDryRun === true
      });
      results.testArtifactsResult = artifacts;
      if (!artifacts) {
        stepState.status = "failed";
        stepState.note = "测试产物生成失败。";
        stepState.retryable = true;
        blockers.push("test artifacts generation failed");
        return;
      }
      stepState.note = `${artifacts.dryRun ? "dry-run" : "written"}; files=${artifacts.generatedFiles.length}`;
      if (artifacts.warnings.length > 0) warnings.push(...artifacts.warnings);
      return;
    }

    case "release-review":
    case "delivery-package":
    case "publish": {
      // Delegate to finalize ops (they mutate response.steps directly via the legacy interface)
      // Build a temporary legacy response object for the finalize ops
      const legacyResponse: IterationFullCycleRunResponse = buildResponseFromCheckpoint(
        iterationId, checkpoint, blockers, warnings, results
      );
      await runFullCycleFinalizeOps({
        repo,
        iterationId,
        input,
        response: legacyResponse,
        blockers,
        warnings,
        refreshReleaseReview: stepId === "release-review",
        generateDeliveryPackage: stepId === "delivery-package",
        publishEnabled: stepId === "publish",
        getIterationReleaseReview: params.getIterationReleaseReview,
        generateIterationDeliveryPackage: params.generateIterationDeliveryPackage,
        publishIterationToRemote: params.publishIterationToRemote
      });
      // Sync results back
      results.releaseReview = legacyResponse.releaseReview ?? results.releaseReview;
      results.deliveryPackageResult = legacyResponse.deliveryPackageResult ?? results.deliveryPackageResult;
      results.publishResult = legacyResponse.publishResult ?? results.publishResult;

      // Map legacy step status back to checkpoint
      if (stepId === "release-review") {
        const ls = legacyResponse.steps.releaseReview;
        if (ls.status === "failed") { stepState.status = "failed"; stepState.retryable = true; }
        stepState.note = ls.note;
      } else if (stepId === "delivery-package") {
        const ls = legacyResponse.steps.deliveryPackage;
        if (ls.status === "failed") { stepState.status = "failed"; stepState.retryable = true; }
        stepState.note = ls.note;
      } else if (stepId === "publish") {
        const ls = legacyResponse.steps.publish;
        if (ls.status === "failed") { stepState.status = "failed"; stepState.retryable = true; }
        if (ls.status === "blocked") { stepState.status = "blocked"; stepState.retryable = true; }
        stepState.note = ls.note;
      }
      return;
    }
  }
}

// ── Shared rewrite instruction builder ──

function buildRewriteInstruction(
  input: IterationFullCycleRunInput,
  iteration: Iteration | null,
  analysisReport: AttachmentAnalysisReport | null
): string {
  const base = input.rewriteInstruction?.trim() ||
    (analysisReport
      ? `依据需求与验收清单执行边界内增量实现：${
          analysisReport.businessConfirmation.necessityAssessment.mustDo.join("；") ||
          analysisReport.businessConfirmation.functionalPoints.slice(0, 3).join("；")
        }`
      : "依据当前迭代边界与验收清单执行增量实现");

  const executableChecks = iteration?.changeControl?.executableConstraints?.acceptanceChecks ?? [];
  const scopeCriteria = iteration?.scope?.acceptanceCriteria ?? [];
  const merged = Array.from(new Set([...scopeCriteria, ...executableChecks])).slice(0, 12);
  const hint = merged.length > 0 ? `。请同时满足以下验收约束：${merged.join("；")}` : "";
  return `${base}${hint}`;
}
