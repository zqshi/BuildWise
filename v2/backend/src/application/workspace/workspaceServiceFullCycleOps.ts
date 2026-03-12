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
import type { AgentRunner } from "./agentRunner";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { runFullCycleFinalizeOps } from "./workspaceServiceFullCycleFinalizeOps";
import { mergeRewriteResults } from "./workspaceServiceAttachmentUtils";
import { generateUxExecutionGuidanceOp } from "./workspaceServiceUxGuidanceOps";
type PublishResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  blockers?: string[];
};

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
  const { repo, agentRunner, iterationId, input } = params;
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const startedAt = new Date().toISOString();
  const blockers: string[] = [];
  const warnings: string[] = [];
  const runAnalysis = input.runAnalysis !== false;
  const autoConfirm = input.autoConfirmAnalysis !== false;
  const autoResolveClarifications = input.autoResolveClarifications !== false;
  const generateTestArtifacts = input.generateTestArtifacts !== false;
  const refreshReleaseReview = input.refreshReleaseReview !== false;
  const generateDeliveryPackage = input.generateDeliveryPackage !== false;
  const publishEnabled = input.publish?.enabled !== false;

  const response: IterationFullCycleRunResponse = {
    iterationId,
    startedAt,
    finishedAt: startedAt,
    status: "failed",
    steps: {
      analysis: { status: "skipped", note: "未执行分析。" },
      confirmation: { status: "skipped", note: "未执行确认。" },
      frontendRewrite: { status: "skipped", note: "未执行前端改写。" },
      backendRewrite: { status: "skipped", note: "未执行后端改写。" },
      rewrite: { status: "skipped", note: "未执行改写。" },
      testArtifacts: { status: "skipped", note: "未生成测试产物。" },
      releaseReview: { status: "skipped", note: "未刷新发布评审。" },
      deliveryPackage: { status: "skipped", note: "未生成交付包。" },
      publish: { status: "skipped", note: "未执行发布。" }
    },
    blockers,
    warnings,
    analysisReport: null,
    rewriteResult: null,
    testArtifactsResult: null,
    releaseReview: null,
    deliveryPackageResult: null,
    publishResult: null
  };

  try {
    if (runAnalysis) {
      if (!input.analysisInput) {
        response.steps.analysis = { status: "failed", note: "缺少 analysisInput，无法执行分析。" };
        blockers.push("analysisInput is required when runAnalysis=true");
        response.status = "failed";
        response.finishedAt = new Date().toISOString();
        return response;
      }
      const report = await params.analyzeAttachment(iterationId, { ...input.analysisInput, agentScope: input.analysisInput.agentScope || "full-cycle" });
      if (!report) {
        response.steps.analysis = { status: "failed", note: "分析失败：迭代不存在或结果为空。" };
        blockers.push("analysis failed");
        response.status = "failed";
        response.finishedAt = new Date().toISOString();
        return response;
      }
      response.analysisReport = report;
      response.steps.analysis = { status: "completed", note: `分析完成：clarification=${report.clarificationQuestions.length}` };
    } else {
      response.steps.analysis = { status: "skipped", note: "按参数跳过分析。" };
    }

    const currentIteration = repo.findIteration(iterationId);
    const currentChangeControl = currentIteration?.changeControl ?? defaultIterationChangeControl();
    const unresolvedClarifications = Array.isArray(currentChangeControl.clarificationQuestions) ? currentChangeControl.clarificationQuestions : [];
    if (autoConfirm) {
      const resolvedClarificationQuestions = autoResolveClarifications ? unresolvedClarifications : [];
      const autoBoundarySource = response.analysisReport?.executableConstraints;
      const autoBoundary = autoBoundarySource
        ? {
            requirementRefs: response.analysisReport?.traceabilityMap.requirementToCode.map((item) => item.requirement).slice(0, 16) || [],
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
          response.steps.confirmation = { status: "blocked", note: "存在未收敛澄清问题，自动确认被阻断。" };
          blockers.push(...(confirmResult.unresolvedQuestions || []));
        } else if (confirmResult.reason === "report_not_publishable") {
          response.steps.confirmation = {
            status: "blocked",
            note: `报告质量门禁阻断：${confirmResult.quality?.summary || "report_not_publishable"}`
          };
          blockers.push(`report_quality=${confirmResult.quality?.score || 0}`);
        } else {
          response.steps.confirmation = { status: "failed", note: "自动确认失败。" };
          blockers.push(confirmResult.reason || "analysis confirmation failed");
        }
      } else {
        response.steps.confirmation = { status: "completed", note: "分析与边界已自动确认。" };
      }
    } else {
      response.steps.confirmation = { status: "skipped", note: "按参数跳过自动确认。" };
    }

    if (response.steps.confirmation.status === "blocked" || response.steps.confirmation.status === "failed") {
      response.status = "blocked";
      response.finishedAt = new Date().toISOString();
      return response;
    }

    const baseRewriteInstruction =
      input.rewriteInstruction?.trim() ||
      (response.analysisReport
        ? `依据需求与验收清单执行边界内增量实现：${
            response.analysisReport.businessConfirmation.necessityAssessment.mustDo.join("；") ||
            response.analysisReport.businessConfirmation.functionalPoints.slice(0, 3).join("；")
          }`
        : "依据当前迭代边界与验收清单执行增量实现");
    const uxGuidance = await generateUxExecutionGuidanceOp({
      agentRunner,
      iteration: repo.findIteration(iterationId) as Iteration | null,
      analysisReport: response.analysisReport,
      rewriteInstruction: baseRewriteInstruction
    });
    if (uxGuidance.warnings.length > 0) {
      warnings.push(...uxGuidance.warnings);
    }
    const iterationAfterUx = repo.findIteration(iterationId);
    const shouldPersistUxArtifacts =
      Boolean(uxGuidance.uxArtifacts?.updatedAt) ||
      (uxGuidance.uxArtifacts?.informationArchitecture.length || 0) > 0 ||
      (uxGuidance.uxArtifacts?.interactionFlows.length || 0) > 0 ||
      (uxGuidance.uxArtifacts?.uiStates.length || 0) > 0 ||
      (uxGuidance.uxArtifacts?.uxConstraints.length || 0) > 0;
    if (iterationAfterUx && uxGuidance.uxArtifacts && shouldPersistUxArtifacts) {
      iterationAfterUx.changeControl = { ...(iterationAfterUx.changeControl || defaultIterationChangeControl()), uxArtifacts: uxGuidance.uxArtifacts };
      repo.updateIteration(iterationAfterUx);
    }
    const executableAcceptanceChecks = iterationAfterUx?.changeControl?.executableConstraints?.acceptanceChecks ?? [];
    const scopeAcceptanceCriteria = iterationAfterUx?.scope?.acceptanceCriteria ?? [];
    const mergedAcceptanceConstraints = Array.from(new Set([...scopeAcceptanceCriteria, ...executableAcceptanceChecks])).slice(0, 12);
    const acceptanceConstraintHint =
      mergedAcceptanceConstraints.length > 0 ? `。请同时满足以下验收约束：${mergedAcceptanceConstraints.join("；")}` : "";
    const rewriteInstruction = uxGuidance.guidance
      ? `${baseRewriteInstruction}${acceptanceConstraintHint}。请同时满足以下 UX 约束：${uxGuidance.guidance}`
      : `${baseRewriteInstruction}${acceptanceConstraintHint}`;
    const rewriteDryRun = input.rewriteDryRun === true;
    const rewriteMaxFiles = typeof input.rewriteMaxFiles === "number" ? input.rewriteMaxFiles : 8;
    const frontendRewrite = await params.rewriteCodeInBoundary(iterationId, {
      instruction: `前端实现要求：${rewriteInstruction}`,
      dryRun: rewriteDryRun,
      maxFiles: Math.max(3, Math.ceil(rewriteMaxFiles / 2)),
      role: "frontend-developer"
    });
    const backendRewrite = await params.rewriteCodeInBoundary(iterationId, {
      instruction: `后端实现要求：${rewriteInstruction}`,
      dryRun: rewriteDryRun,
      maxFiles: Math.max(3, Math.ceil(rewriteMaxFiles / 2)),
      role: "backend-developer"
    });
    const rewrite = mergeRewriteResults(iterationId, rewriteDryRun, [
      { label: "frontend", result: frontendRewrite },
      { label: "backend", result: backendRewrite }
    ]);
    const frontendBlocked = (frontendRewrite?.outOfBoundaryFiles.length || 0) > 0;
    const backendBlocked = (backendRewrite?.outOfBoundaryFiles.length || 0) > 0;
    response.steps.frontendRewrite = frontendRewrite
      ? { status: frontendBlocked ? "blocked" : "completed", note: `${frontendRewrite.dryRun ? "dry-run" : "applied"}; edits=${frontendRewrite.edits.length}; skipped=${frontendRewrite.skippedFiles.length}` }
      : { status: "failed", note: "前端改写失败：结果为空。" };
    response.steps.backendRewrite = backendRewrite
      ? { status: backendBlocked ? "blocked" : "completed", note: `${backendRewrite.dryRun ? "dry-run" : "applied"}; edits=${backendRewrite.edits.length}; skipped=${backendRewrite.skippedFiles.length}` }
      : { status: "failed", note: "后端改写失败：结果为空。" };
    response.rewriteResult = rewrite;
    if (rewrite.outOfBoundaryFiles.length > 0) {
      response.steps.rewrite = { status: "blocked", note: "存在越界改写，已阻断。" };
      blockers.push(...rewrite.outOfBoundaryFiles.map((item) => `out_of_boundary:${item}`));
    } else {
      const changedCount = rewrite.edits.length;
      if (changedCount === 0) {
        response.steps.rewrite = { status: "failed", note: "代码改写失败：未产生有效改动。" };
        blockers.push("rewrite produced zero edits");
        response.status = "failed";
        response.finishedAt = new Date().toISOString();
        return response;
      }
      response.steps.rewrite = { status: "completed", note: `${rewrite.dryRun ? "dry-run" : "applied"}; edits=${changedCount}; skipped=${rewrite.skippedFiles.length}` };
    }

    if (response.steps.rewrite.status === "blocked" || response.steps.rewrite.status === "failed") {
      response.status = "blocked";
      response.finishedAt = new Date().toISOString();
      return response;
    }

    if (generateTestArtifacts) {
      const artifacts = await params.generateIterationTestArtifacts(iterationId, { dryRun: input.testArtifactsDryRun === true });
      response.testArtifactsResult = artifacts;
      if (!artifacts) {
        response.steps.testArtifacts = { status: "failed", note: "测试产物生成失败。" };
        blockers.push("test artifacts generation failed");
      } else {
        response.steps.testArtifacts = { status: "completed", note: `${artifacts.dryRun ? "dry-run" : "written"}; files=${artifacts.generatedFiles.length}` };
        if (artifacts.warnings.length > 0) warnings.push(...artifacts.warnings);
      }
    } else {
      response.steps.testArtifacts = { status: "skipped", note: "按参数跳过测试产物生成。" };
    }

    await runFullCycleFinalizeOps({
      repo,
      iterationId,
      input,
      response,
      blockers,
      warnings,
      refreshReleaseReview,
      generateDeliveryPackage,
      publishEnabled,
      getIterationReleaseReview: params.getIterationReleaseReview,
      generateIterationDeliveryPackage: params.generateIterationDeliveryPackage,
      publishIterationToRemote: params.publishIterationToRemote
    });

    const hasFailed = Object.values(response.steps).some((item) => item.status === "failed");
    const hasBlocked = Object.values(response.steps).some((item) => item.status === "blocked");
    if (hasFailed) {
      response.status = "failed";
    } else if (hasBlocked) {
      response.status = "blocked";
    } else if (warnings.length > 0 || Object.values(response.steps).some((item) => item.status === "skipped")) {
      response.status = "partial";
    } else {
      response.status = "completed";
    }
    response.finishedAt = new Date().toISOString();
    writeAuditLog(repo, "iteration_full_cycle_executed", `iteration:${iterationId}`, `status=${response.status};blockers=${blockers.length};warnings=${warnings.length}`);
    return response;
  } catch (error) {
    response.status = "failed";
    response.finishedAt = new Date().toISOString();
    blockers.push(error instanceof Error ? error.message : "full cycle failed");
    response.steps.publish = response.steps.publish.status === "skipped" ? { status: "failed", note: "Full-cycle execution aborted." } : response.steps.publish;
    return response;
  }
}
