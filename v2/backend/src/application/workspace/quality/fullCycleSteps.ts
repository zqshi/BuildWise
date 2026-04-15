import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId, FullCycleStepState } from '../../../domain/workspace/iterationTypes';
import type { FullCycleRunParams, BuildResponseFn } from './fullCycleOps';
import { defaultIterationChangeControl } from '../shared/common';
import { runFullCycleFinalizeOps } from './fullCycleFinalizeOps';
import { mergeRewriteResults } from '../upload/attachmentUtils';
import { generateUxExecutionGuidanceOp } from './uxGuidanceOps';

export type FullCycleStepResults = {
  analysisReport: AttachmentAnalysisReport | null;
  rewriteResult: IterationFullCycleRunResponse["rewriteResult"];
  testArtifactsResult: IterationTestArtifactsGenerationResponse | null;
  releaseReview: IterationReleaseReviewResponse | null;
  deliveryPackageResult: IterationDeliveryPackageResult | null;
  publishResult: IterationFullCycleRunResponse["publishResult"];
};

type StepContext = {
  params: FullCycleRunParams;
  input: IterationFullCycleRunInput;
  stepState: FullCycleStepState;
  results: FullCycleStepResults;
  blockers: string[];
  warnings: string[];
};

async function executeStepAnalysis(ctx: StepContext): Promise<void> {
  const { params, input, stepState, results, blockers } = ctx;
  if (!input.analysisInput) {
    stepState.status = "failed";
    stepState.note = "缺少 analysisInput，无法执行分析。";
    stepState.retryable = false;
    blockers.push("缺少分析输入材料");
    return;
  }
  const report = await params.analyzeAttachment(params.iterationId, {
    ...input.analysisInput,
    agentScope: input.analysisInput.agentScope || "full-cycle"
  });
  if (!report) {
    stepState.status = "failed";
    stepState.note = "分析失败：迭代不存在或结果为空。";
    stepState.retryable = true;
    blockers.push("材料分析失败");
    return;
  }
  results.analysisReport = report;
  stepState.note = `分析完成，待澄清问题 ${report.clarificationQuestions.length} 个`;
}

async function executeStepConfirmation(ctx: StepContext): Promise<void> {
  const { params, stepState, results, blockers } = ctx;
  const { repo, iterationId } = params;
  const currentIteration = repo.findIteration(iterationId);
  const currentCC = currentIteration?.changeControl ?? defaultIterationChangeControl();
  const unresolvedClarifications = Array.isArray(currentCC.clarificationQuestions) ? currentCC.clarificationQuestions : [];
  const autoResolveClarifications = ctx.input.autoResolveClarifications !== false;
  const resolvedClarificationQuestions = autoResolveClarifications ? unresolvedClarifications : [];
  const autoBoundarySource = results.analysisReport?.executableConstraints;
  const autoBoundary = autoBoundarySource
    ? {
        requirementRefs: results.analysisReport?.traceabilityMap.requirementToCode.map((item) => item.requirement).slice(0, 16) || [],
        componentRefs: autoBoundarySource.componentWhitelist,
        codePaths: autoBoundarySource.codePathWhitelist,
        note: "由全流程执行器自动确认。"
      }
    : undefined;
  const confirmResult = params.confirmIterationAnalysis(iterationId, {
    accurate: true, note: "全流程执行器自动确认", actor: "full-cycle-bot",
    resolvedClarificationQuestions, boundary: autoBoundary
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
      blockers.push(`报告质量评分 ${confirmResult.quality?.score || 0} 分，未达标`);
    } else {
      stepState.status = "failed";
      stepState.note = `自动确认失败：${confirmResult.reason || "原因未知"}`;
      stepState.retryable = true;
      blockers.push(`分析确认失败：${confirmResult.reason || "原因未知"}`);
    }
    return;
  }
  stepState.note = "分析与边界已自动确认。";
}

async function executeStepUxGuidance(ctx: StepContext): Promise<void> {
  const { params, input, stepState, results, warnings } = ctx;
  const { repo, agentRunner, iterationId } = params;
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
    agentRunner, iteration: iterationForUx,
    analysisReport: results.analysisReport, rewriteInstruction: baseRewriteInstruction
  });
  if (uxGuidance.warnings.length > 0) warnings.push(...uxGuidance.warnings);
  const iterationAfterUx = repo.findIteration(iterationId);
  const hasUxData =
    Boolean(uxGuidance.uxArtifacts?.updatedAt) ||
    (uxGuidance.uxArtifacts?.informationArchitecture.length || 0) > 0 ||
    (uxGuidance.uxArtifacts?.interactionFlows.length || 0) > 0 ||
    (uxGuidance.uxArtifacts?.uiStates.length || 0) > 0 ||
    (uxGuidance.uxArtifacts?.uxConstraints.length || 0) > 0;
  if (iterationAfterUx && uxGuidance.uxArtifacts && hasUxData) {
    iterationAfterUx.changeControl = {
      ...(iterationAfterUx.changeControl || defaultIterationChangeControl()),
      uxArtifacts: uxGuidance.uxArtifacts
    };
    repo.updateIteration(iterationAfterUx);
  }
  stepState.note = uxGuidance.guidance ? "UX 执行指引已生成。" : "UX 指引跳过（无需额外约束）。";
}

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

async function executeStepRewrite(
  role: "frontend-developer" | "backend-developer",
  label: string,
  ctx: StepContext
): Promise<void> {
  const { params, input, stepState, results, blockers } = ctx;
  const { repo, iterationId } = params;
  const iterForRewrite = repo.findIteration(iterationId);
  const rewriteInstruction = buildRewriteInstruction(input, iterForRewrite, results.analysisReport);
  const rewriteDryRun = input.rewriteDryRun === true;
  const rewriteMaxFiles = typeof input.rewriteMaxFiles === "number" ? input.rewriteMaxFiles : 8;
  const result = await params.rewriteCodeInBoundary(iterationId, {
    instruction: `${label}实现要求：${rewriteInstruction}`,
    dryRun: rewriteDryRun,
    maxFiles: Math.max(3, Math.ceil(rewriteMaxFiles / 2)),
    role
  });
  if (!result) {
    stepState.status = "failed";
    stepState.note = `${label}改写失败：结果为空。`;
    stepState.retryable = true;
    return;
  }
  if ((result.outOfBoundaryFiles?.length || 0) > 0) {
    stepState.status = "blocked";
    stepState.note = `${label}改写存在越界文件。`;
    stepState.retryable = true;
    blockers.push(...result.outOfBoundaryFiles.map((f) => `越界文件：${f}`));
    return;
  }
  stepState.note = result.dryRun ? "模拟执行完成" : `${label}改写完成，修改 ${result.edits.length} 处，跳过 ${result.skippedFiles.length} 个文件`;
}

async function executeStepTestArtifacts(ctx: StepContext): Promise<void> {
  const { params, input, stepState, results, blockers, warnings } = ctx;
  const artifacts = await params.generateIterationTestArtifacts(params.iterationId, {
    dryRun: input.testArtifactsDryRun === true
  });
  results.testArtifactsResult = artifacts;
  if (!artifacts) {
    stepState.status = "failed";
    stepState.note = "测试产物生成失败。";
    stepState.retryable = true;
    blockers.push("测试产物生成失败");
    return;
  }
  stepState.note = artifacts.dryRun ? "模拟执行完成" : `测试产物已生成，共 ${artifacts.generatedFiles.length} 个文件`;
  if (artifacts.warnings.length > 0) warnings.push(...artifacts.warnings);
}

async function executeStepFinalize(
  stepId: "release-review" | "delivery-package" | "publish",
  ctx: StepContext,
  checkpoint: FullCycleCheckpoint,
  buildResponseFromCheckpoint: BuildResponseFn
): Promise<void> {
  const { params, input, stepState, results, blockers, warnings } = ctx;
  const { repo, iterationId } = params;
  const legacyResponse = buildResponseFromCheckpoint(iterationId, checkpoint, blockers, warnings, results);
  await runFullCycleFinalizeOps({
    repo, iterationId, input, response: legacyResponse,
    blockers, warnings,
    refreshReleaseReview: stepId === "release-review",
    generateDeliveryPackage: stepId === "delivery-package",
    publishEnabled: stepId === "publish",
    getIterationReleaseReview: params.getIterationReleaseReview,
    generateIterationDeliveryPackage: params.generateIterationDeliveryPackage,
    publishIterationToRemote: params.publishIterationToRemote
  });
  results.releaseReview = legacyResponse.releaseReview ?? results.releaseReview;
  results.deliveryPackageResult = legacyResponse.deliveryPackageResult ?? results.deliveryPackageResult;
  results.publishResult = legacyResponse.publishResult ?? results.publishResult;
  const legacyStepKey = stepId === "release-review" ? "releaseReview"
    : stepId === "delivery-package" ? "deliveryPackage" : "publish";
  const ls = legacyResponse.steps[legacyStepKey];
  if (ls.status === "failed") { stepState.status = "failed"; stepState.retryable = true; }
  if (stepId === "publish" && ls.status === "blocked") { stepState.status = "blocked"; stepState.retryable = true; }
  stepState.note = ls.note;
}

export async function executeStep(
  stepId: FullCycleStepId,
  params: FullCycleRunParams,
  input: IterationFullCycleRunInput,
  checkpoint: FullCycleCheckpoint,
  results: FullCycleStepResults,
  blockers: string[],
  warnings: string[],
  buildResponseFromCheckpoint: BuildResponseFn
): Promise<void> {
  const stepState = checkpoint.steps[stepId];
  const ctx: StepContext = { params, input, stepState, results, blockers, warnings };

  switch (stepId) {
    case "analysis": return executeStepAnalysis(ctx);
    case "confirmation": return executeStepConfirmation(ctx);
    case "ux-guidance": return executeStepUxGuidance(ctx);
    case "frontend-rewrite": return executeStepRewrite("frontend-developer", "前端", ctx);
    case "backend-rewrite": return executeStepRewrite("backend-developer", "后端", ctx);
    case "merge-rewrite": {
      const rewriteDryRun = input.rewriteDryRun === true;
      results.rewriteResult = mergeRewriteResults(params.iterationId, rewriteDryRun, []);
      stepState.note = "改写结果已合并。";
      return;
    }
    case "test-artifacts": return executeStepTestArtifacts(ctx);
    case "release-review":
    case "delivery-package":
    case "publish":
      return executeStepFinalize(stepId, ctx, checkpoint, buildResponseFromCheckpoint);
  }
}
