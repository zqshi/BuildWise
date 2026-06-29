import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { LlmInvocationError, type AgentRunner } from '../shared/agentRunner';
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationStatus,
  IterationTransitionSource,
} from '../../../domain/workspace/types';
import type { IterationGeneratedTestCase } from '../../../domain/workspace/iterationTypes';
import { inferCyclePhase, normalizeIteration } from '../shared/workspaceSupport';
import {
  collectLlmBackedReportPayloadIssues,
  extractBoundarySuggestion,
  extractGeneratedQualityArtifacts,
  extractReleaseOpsActions,
  extractUxArtifacts,
  isLowSignalText
} from './extractors';
import { synthesizeTestMatrixOp } from './testMatrixGenerationOps';
import { synthesizeCodePathsByPlatformOp } from './codePathPlatformLabelingOps';
import { summarizeTestMatrixByPlatform } from '../changeControl/testMatrixSummaryOps';
import type { ReleaseReviewPlatformContext } from './releaseReviewOps';
import { buildClarificationQuestionsOp } from './synthesisOps';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import { CONTEXT_GUARDRAILS, runAnalysisPrompt, USE_CONSOLIDATED_AGENTS } from './configOps';
import {
  consolidatedPreflightPhase,
  consolidatedAgentPhase,
  consolidatedSynthesisPhase,
  consolidatedQualityPhase
} from './consolidatedPipelineOps';
import { applyLifecycleTransitionOp } from './analysisHelpers';
import {
  runPreflightPhase,
  runAgentExecutionPhase,
  runSynthesisPipeline,
  runQualityGatePhase,
  writebackKnowledgeState
} from './analysisPipelineOps';

// ── Phase 6: 报告组装 ──

function assembleAnalysisReport(input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, pre: Awaited<ReturnType<typeof runPreflightPhase>>, exec: Awaited<ReturnType<typeof runAgentExecutionPhase>>, syn: Awaited<ReturnType<typeof runSynthesisPipeline>>, qg: Awaited<ReturnType<typeof runQualityGatePhase>>, generatedAt: string, clarificationQuestions: string[], qualityArtifacts: ReturnType<typeof extractGeneratedQualityArtifacts> & { materializedFiles: string[] }, uxArtifacts: ReturnType<typeof extractUxArtifacts>, finalLifecycleAction: ReturnType<typeof applyLifecycleTransitionOp>, repo: WorkspaceRepository, iterationId: number): AttachmentAnalysisReport {
  const { excerptPayload, diffLocations, added, changed, removed } = pre;
  const { finalAgentPlan, agentOutputs, unknownSignalCount } = exec;
  const { attachmentInsights, resolvedProjectDetection, resolvedMeaningfulFindings, resolvedPrioritizedFindings, finalNextActions, businessConfirmationWithUx, deepInsights, synthesisOutputs } = syn;
  const { reportQuality, releaseReview, opsTriage, traceabilityMap, domainKnowledge, versionDiffDetailed, executableConstraints } = qg;
  const finalContextGuardrail = { degraded: pre.executionPolicy.degraded, reason: pre.executionPolicy.reason };
  const llmPromptContextLength = finalAgentPlan.prompts.reduce((t, p) => t + p.systemPrompt.length + p.userPrompt.length, 0);

  const outputList = synthesisOutputs.length > 0 ? [...agentOutputs, ...synthesisOutputs] : agentOutputs;
  const reportPayloadIssues = collectLlmBackedReportPayloadIssues({
    projectDetection: resolvedProjectDetection, meaningfulFindings: resolvedMeaningfulFindings,
    prioritizedFindings: resolvedPrioritizedFindings, nextActions: finalNextActions,
    businessConfirmation: businessConfirmationWithUx, reportQuality, outputList
  });
  if (reportPayloadIssues.length > 0) {
    throw new LlmInvocationError(`分析报告质量不达标: ${reportPayloadIssues.join(", ")}`);
  }

  const llmModels = Array.from(new Set(outputList.map((i) => (i.model || "").trim()).filter(Boolean)));
  const finalRisks = Array.from(new Set([
    ...versionDiffDetailed.riskPoints.filter((i) => !isLowSignalText(i)),
    ...resolvedPrioritizedFindings.filter((i) => i.priority === "P0" || i.priority === "P1").map((i) => i.reason).filter((i: string) => !isLowSignalText(i))
  ])).slice(0, 12);
  const finalSuggestions = Array.from(new Set([
    ...reportQuality.actionRequired.filter((i) => !isLowSignalText(i)),
    ...releaseReview.recommendations.filter((i) => !isLowSignalText(i)),
    ...finalNextActions.filter((i) => !isLowSignalText(i)),
    ...attachmentInsights.limitations.filter((i) => !isLowSignalText(i)),
    ...uxArtifacts.uxConstraints.filter((i) => !isLowSignalText(i))
  ])).slice(0, 16);

  writeAuditLog(repo, "attachment_llm_trace", `iteration:${iterationId}`, `models=${llmModels.join("|") || "unknown"};outputs=${outputList.length};target=${input.fileName}`);
  writeAuditLog(repo, "analysis.project-detection-synthesized", `iteration:${iterationId}`, `target=${input.fileName}`);

  return {
    iterationId: normalized.id, iterationName: normalized.name,
    fileName: input.fileName, sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
    fileStats: excerptPayload.fileStats, fileSelection: excerptPayload.fileSelection,
    projectDetection: resolvedProjectDetection, meaningfulFindings: resolvedMeaningfulFindings,
    prioritizedFindings: resolvedPrioritizedFindings, nextActions: finalNextActions,
    analyzedAt: generatedAt, attachmentInsights,
    llmContext: {
      strategy: excerptPayload.strategy, digest: excerptPayload.digest,
      excerptLength: excerptPayload.text.length,
      chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
      promptContextLength: llmPromptContextLength, agentCount: finalAgentPlan.prompts.length,
      unknownSignalCount, degraded: finalContextGuardrail.degraded, degradeReason: finalContextGuardrail.reason
    },
    clarificationQuestions,
    understanding: [businessConfirmationWithUx.coreIntent, businessConfirmationWithUx.versionDiffSummary,
      resolvedPrioritizedFindings.length > 0 ? `优先关注：${resolvedPrioritizedFindings[0].content}` : ""
    ].filter((i) => i && i.trim().length > 0 && !isLowSignalText(i)).join(" "),
    versionDiff: { baselineIterationName: previous?.name ?? "无基线", added, changed, removed },
    versionDiffDetailed, diffLocations, cyclePhase: inferCyclePhase(normalized.status),
    agentPlan: finalAgentPlan, agentOutputs: outputList, lifecycleAction: finalLifecycleAction,
    risks: finalRisks, traceabilityMap, executableConstraints: { ...executableConstraints, gateRules: ["仅允许改动代码路径白名单内文件。", "发布前测试矩阵不得存在失败或阻断用例。", "生产环境需发布评审通过且验收清单非空。"] },
    releaseReview, qualityArtifacts, uxArtifacts, domainKnowledge, opsTriage,
    businessConfirmation: businessConfirmationWithUx, deepInsights, reportQuality, suggestions: finalSuggestions
  };
}

function buildAnalysisDigest(pre: { added: string[]; removed: string[]; diffLocations: Array<unknown>; excerptPayload: { strategy: string }; executionPolicy: { degraded: boolean; reason: string; promptBudgetRisk: string } }, input: AttachmentUploadInput) {
  const chunks = Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0;
  const parts = [
    `新增 ${pre.added.length} 项`,
    `移除 ${pre.removed.length} 项`,
    `差异定位 ${pre.diffLocations.length} 处`,
    `策略 ${pre.excerptPayload.strategy}`,
    `分片 ${chunks}`,
    pre.executionPolicy.degraded ? `已降级（${pre.executionPolicy.reason || "未知原因"}）` : "未降级",
    `预算风险 ${pre.executionPolicy.promptBudgetRisk}`
  ];
  return parts.join("，");
}

function buildPreAnalysisChangeControl(
  currentChangeControl: ReturnType<typeof defaultIterationChangeControl>,
  resolvedBoundary: ReturnType<typeof defaultIterationChangeControl>["boundary"],
  generatedAt: string,
  pre: { executionPolicy: { degraded: boolean; reason: string; promptBudgetRisk: string }; added: string[]; removed: string[]; diffLocations: Array<unknown>; excerptPayload: { strategy: string } },
  input: AttachmentUploadInput,
  clarificationQuestions: string[],
  generatedTestMatrix: IterationGeneratedTestCase[],
  qualityArtifacts: ReturnType<typeof extractGeneratedQualityArtifacts> & { materializedFiles: string[] },
  uxArtifacts: ReturnType<typeof extractUxArtifacts>,
  executableConstraints: { componentWhitelist: string[]; codePathWhitelist: string[]; acceptanceChecks: string[]; generatedAt: string }
): ReturnType<typeof defaultIterationChangeControl> {
  return {
    ...currentChangeControl,
    pendingHumanConfirmation: true, lastAnalysisAt: generatedAt, lastAnalysisFileName: input.fileName,
    lastAnalysisDigest: buildAnalysisDigest(pre, input),
    clarificationQuestions, clarificationDraftResolvedQuestions: [], clarificationDraftUpdatedAt: generatedAt,
    lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: clarificationQuestions, updatedAt: generatedAt },
    lastClarificationNote: "", confirmedAt: "", confirmedBy: "", boundary: resolvedBoundary,
    generatedTestMatrix, generatedTestMatrixUpdatedAt: generatedTestMatrix.length > 0 ? generatedAt : "", testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: { ...qualityArtifacts, updatedAt: generatedAt },
    uxArtifacts: { ...uxArtifacts, updatedAt: generatedAt },
    executableConstraints
  };
}

// ── Coordinator: 分析管道总调度 ──

export async function analyzeAttachmentOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  transitionIteration: (
    iterationId: number,
    toStatus: IterationStatus,
    input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
  ) => { ok: boolean; reason?: string },
  iterationId: number,
  input: AttachmentUploadInput,
  hooks?: { onStageChange?: (stage: string) => void }
): Promise<AttachmentAnalysisReport | null> {
  const markStage = (stage: string) => { hooks?.onStageChange?.(stage); };
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;

  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  const normalizedPrevious = previous ? normalizeIteration(previous) : null;

  // Phase 1: Preflight
  const pre = USE_CONSOLIDATED_AGENTS
    ? await consolidatedPreflightPhase(agentRunner, input, normalized, normalizedPrevious, markStage)
    : await runPreflightPhase(agentRunner, input, normalized, normalizedPrevious, markStage);

  // Phase 2: Agent 执行
  const exec = USE_CONSOLIDATED_AGENTS
    ? await consolidatedAgentPhase(agentRunner, repo, input, normalized, normalizedPrevious, pre, markStage)
    : await runAgentExecutionPhase(agentRunner, repo, input, normalized, normalizedPrevious, pre, markStage);

  // Extract artifacts from agent outputs
  const targetPlatforms = repo.findProject(normalized.projectId)?.targetPlatforms ?? ["web"];
  const generatedTestMatrix = await synthesizeTestMatrixOp(agentRunner, {
    iterationName: normalized.name,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: pre.excerptPayload.text,
    targetPlatforms
  }, { runAnalysisPrompt });
  const qualityArtifactsRaw = extractGeneratedQualityArtifacts(exec.agentOutputs);
  const uxArtifacts = extractUxArtifacts(exec.agentOutputs);
  const boundarySuggestion = extractBoundarySuggestion(exec.agentOutputs);
  const releaseOpsActions = extractReleaseOpsActions(exec.agentOutputs);

  const clarificationQuestions = buildClarificationQuestionsOp({
    guardrail: { degraded: pre.executionPolicy.degraded, reason: pre.executionPolicy.reason },
    unknownSignalCount: exec.unknownSignalCount,
    unknownSignalThreshold: CONTEXT_GUARDRAILS.unknownSignalThreshold,
    strategy: pre.excerptPayload.strategy, diffLocations: pre.diffLocations
  });

  // Boundary resolution + initial persist
  const currentChangeControl = normalized.changeControl ?? defaultIterationChangeControl();
  const currentBoundary = currentChangeControl.boundary ?? defaultIterationChangeControl().boundary;
  const boundaryIsEmpty = currentBoundary.requirementRefs.length === 0 && currentBoundary.componentRefs.length === 0 && currentBoundary.codePaths.length === 0 && !currentBoundary.note;
  // T2: 为代码路径标注归属端（LLM），产出 codePathsByPlatform 供端级门禁 assessPlatformCodeChangeReadiness
  const effectiveCodePaths = boundarySuggestion && boundaryIsEmpty ? boundarySuggestion.codePaths : currentBoundary.codePaths;
  const labeledCodePathsByPlatform = effectiveCodePaths.length > 0
    ? await synthesizeCodePathsByPlatformOp(agentRunner, { iterationName: normalized.name, codePaths: effectiveCodePaths, targetPlatforms }, { runAnalysisPrompt })
    : undefined;
  const resolvedBoundary = boundarySuggestion && boundaryIsEmpty
    ? { requirementRefs: boundarySuggestion.requirementRefs, componentRefs: boundarySuggestion.componentRefs, codePaths: boundarySuggestion.codePaths, codePathsByPlatform: labeledCodePathsByPlatform, note: boundarySuggestion.note || "由 boundary-guardian 自动建议，待人工确认。", updatedAt: new Date().toISOString() }
    : { ...currentBoundary, codePathsByPlatform: currentBoundary.codePathsByPlatform ?? labeledCodePathsByPlatform };
  const generatedAt = new Date().toISOString();
  const existingMaterializedFiles = Array.isArray(currentChangeControl.qualityArtifacts?.materializedFiles) ? currentChangeControl.qualityArtifacts.materializedFiles : [];
  const qualityArtifacts = { ...qualityArtifactsRaw, materializedFiles: existingMaterializedFiles };
  const finalLifecycleAction = applyLifecycleTransitionOp(transitionIteration, iterationId, normalized.status, exec.finalAgentPlan.recommendedTransition, input.autoTransition === true);

  normalized.changeControl = buildPreAnalysisChangeControl(
    currentChangeControl, resolvedBoundary, generatedAt, pre, input,
    clarificationQuestions, generatedTestMatrix, qualityArtifacts, uxArtifacts,
    {
      componentWhitelist: resolvedBoundary.componentRefs.slice(0, 24),
      codePathWhitelist: resolvedBoundary.codePaths.slice(0, 24),
      acceptanceChecks: Array.from(new Set([...normalized.scope.acceptanceCriteria, ...qualityArtifactsRaw.acceptanceChecklist])).slice(0, 24),
      generatedAt
    }
  );
  repo.updateIteration(normalized);
  writeAuditLog(repo, "analysis.attachment-analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
  if (generatedTestMatrix.length > 0) writeAuditLog(repo, "analysis.test-matrix-generated", `iteration:${iterationId}`, `cases=${generatedTestMatrix.length}`);

  // Phase 3: 合成管道
  const syn = USE_CONSOLIDATED_AGENTS
    ? await consolidatedSynthesisPhase(agentRunner, input, normalized, normalizedPrevious, pre, exec, clarificationQuestions, uxArtifacts, releaseOpsActions, markStage)
    : await runSynthesisPipeline(agentRunner, input, normalized, normalizedPrevious, pre, exec, clarificationQuestions, uxArtifacts, releaseOpsActions, markStage);

  // T3: 装配按端评审上下文（声明端 + 测试矩阵按端聚合 + 代码白名单按端归属），供 LLM 按端评审真实依据
  const releaseReviewPlatformContext: ReleaseReviewPlatformContext = {
    targetPlatforms,
    testMatrixByPlatform: summarizeTestMatrixByPlatform(generatedTestMatrix, targetPlatforms),
    codePathsByPlatform: resolvedBoundary.codePathsByPlatform
  };

  // Phase 4: 质量门 + 发布评审
  const qg = USE_CONSOLIDATED_AGENTS
    ? await consolidatedQualityPhase(agentRunner, input, normalized, pre, exec, syn, clarificationQuestions, releaseReviewPlatformContext, markStage)
    : await runQualityGatePhase(agentRunner, input, normalized, pre, exec, syn, clarificationQuestions, releaseReviewPlatformContext, markStage);

  // Phase 5: 知识回写 + 本体
  await writebackKnowledgeState(repo, iteration, normalized, pre, syn, qg, generatedAt, uxArtifacts, generatedTestMatrix, markStage, agentRunner);

  // Phase 6: 报告组装
  return assembleAnalysisReport(input, normalized, normalizedPrevious, pre, exec, syn, qg, generatedAt, clarificationQuestions, qualityArtifacts, uxArtifacts, finalLifecycleAction, repo, iterationId);
}
