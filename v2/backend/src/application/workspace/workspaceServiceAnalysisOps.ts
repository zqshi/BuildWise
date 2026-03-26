import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { LlmInvocationError, type AgentRunner } from "./agentRunner";
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  IterationStatus,
  IterationTransitionSource,
} from "../../domain/workspace/types";
import {
  buildDiffLocations,
  buildIterationAgentPlan,
  inferCyclePhase,
  normalizeIteration,
  shouldUseCompactSingleFileAnalysis
} from "./workspaceSupport";
import {
  collectLlmBackedReportPayloadIssues,
  extractBoundarySuggestion,
  extractGeneratedQualityArtifacts,
  extractGeneratedTestMatrix,
  extractReleaseOpsActions,
  extractReleaseOpsStructured,
  extractReleaseReview,
  extractUxArtifacts,
  isLowSignalText
} from "./workspaceAnalysisExtractors";
import { buildClarificationQuestionsOp, mergeSynthesisResultsOp } from "./workspaceServiceAnalysisSynthesisOps";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { composeAttachmentExcerpt, resolveVisionPayloads } from "./workspaceServiceAnalysisInputOps";
import {
  synthesizeBusinessConfirmationOp,
  synthesizeGovernanceInsightsOp,
  synthesizeReleaseReviewOp,
  synthesizeReportQualityGateOp
} from "./workspaceServiceAnalysisGovernanceRunnerOps";
import { synthesizeProjectProfileOp } from "./workspaceServiceAnalysisProjectProfileRunnerOps";
import { CONTEXT_GUARDRAILS, SYNTHESIS_LLM_CONFIG, runAnalysisPrompt } from "./workspaceServiceAnalysisConfig";
import {
  synthesizeExecutionPolicyOp,
  synthesizeFolderSelectionOp,
  synthesizeDeepInsightsOp,
  executeAgentPlanOp,
  synthesizeAttachmentInsightsOp
} from "./workspaceServiceAnalysisSynthesisTaskOps";

function applyLifecycleTransitionOp(
  transitionIteration: (
    iterationId: number,
    toStatus: IterationStatus,
    input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
  ) => { ok: boolean; reason?: string },
  iterationId: number,
  fromStatus: IterationStatus,
  toStatus: IterationStatus | null,
  autoTransition: boolean
) {
  if (!toStatus || toStatus === fromStatus) {
    return { attempted: false, applied: false, fromStatus, toStatus, note: "推荐状态与当前一致，未触发自动流转。" };
  }
  if (!autoTransition) {
    return { attempted: false, applied: false, fromStatus, toStatus, note: `已生成状态流转建议 ${fromStatus} -> ${toStatus}，等待手动确认。` };
  }
  const result = transitionIteration(iterationId, toStatus, {
    source: "auto",
    reason: "Agent 自动驱动流转",
    operator: "agent-runner",
    operatorRole: "system"
  });
  if (result.ok) {
    return { attempted: true, applied: true, fromStatus, toStatus, note: `已自动流转：${fromStatus} -> ${toStatus}` };
  }
  return { attempted: true, applied: false, fromStatus, toStatus, note: `自动流转失败：${result.reason || "unknown"}` };
}

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
  hooks?: {
    onStageChange?: (stage: string) => void;
  }
): Promise<AttachmentAnalysisReport | null> {
  const markStage = (stage: string) => {
    hooks?.onStageChange?.(stage);
  };
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  const previousScope = previous?.scope.inScope ?? [];
  const currentScope = normalized.scope.inScope;
  markStage("preflight:folder-selection");
  const folderSelection =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? await synthesizeFolderSelectionOp(agentRunner, input)
      : null;
  const excerptPayload = composeAttachmentExcerpt(input, CONTEXT_GUARDRAILS, folderSelection);
  const visionPayloads = resolveVisionPayloads(input);
  const added = currentScope.filter((item) => !previousScope.includes(item));
  const removed = previousScope.filter((item) => !currentScope.includes(item));
  const diffLocations = buildDiffLocations(previous ? normalizeIteration(previous) : null, normalized);
  const changed = diffLocations.filter((item) => item.changeType === "changed").map((item) => `${item.dimension}: ${item.currentItem}`);
  const normalizedRisks = normalized.assessment.risks.filter((item) => !isLowSignalText(item));
  markStage("preflight:execution-policy");
  const executionPolicy = await synthesizeExecutionPolicyOp(agentRunner, {
    iterationName: normalized.name,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerptPayload,
    chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
    forceMultiAgentHint: input.forceMultiAgent
  });
  const finalContextGuardrail = {
    degraded: executionPolicy.degraded,
    reason: executionPolicy.reason
  };
  const files = Array.isArray(input.files) ? input.files : [];
  const totalFiles = input.sourceType === "folder" ? files.length : 1;
  const hasPrototypeEvidence =
    visionPayloads.length > 0 ||
    files.some((item) => {
      const mime = (item.mimeType || "").toLowerCase();
      const path = (item.path || item.fileName || "").toLowerCase();
      return mime.startsWith("image/") || /prototype|figma|sketch|xd/.test(path);
    });
  const hasDocumentEvidence =
    files.length === 0 ||
    files.some((item) => {
      const mime = (item.mimeType || "").toLowerCase();
      const path = (item.path || item.fileName || "").toLowerCase();
      return (
        mime.includes("text") ||
        mime.includes("json") ||
        mime.includes("xml") ||
        mime.includes("markdown") ||
        /\.(md|mdx|txt|doc|docx|pdf|ppt|pptx|xlsx|csv|json|yml|yaml)$/i.test(path)
      );
    });
  const finalAgentPlan = buildIterationAgentPlan({
    iteration: normalized,
    previous: previous ? normalizeIteration(previous) : null,
    scope: input.agentScope ?? "full-cycle",
    diffLocations,
    risks: normalizedRisks,
    fileName: input.fileName,
    attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
    attachmentSignals: {
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      hasPrototypeEvidence,
      hasDocumentEvidence,
      totalFiles
    }
  });
  const skipAgentPlanExecution = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      hasPrototypeEvidence,
      hasDocumentEvidence,
      totalFiles
    }
  });
  let agentOutputs: IterationAgentOutput[] = [];
  if (skipAgentPlanExecution) {
    markStage("analysis:agent-plan-skipped");
  } else {
    markStage("analysis:agent-plan");
    agentOutputs = await executeAgentPlanOp(agentRunner, finalAgentPlan.prompts, visionPayloads);
  }
  const unknownSignalCount = agentOutputs.reduce((total, output) => total + (output.content.toLowerCase().match(/unknown/g)?.length ?? 0), 0);
  const generatedTestMatrix = extractGeneratedTestMatrix(agentOutputs);
  const qualityArtifacts = extractGeneratedQualityArtifacts(agentOutputs);
  const uxArtifacts = extractUxArtifacts(agentOutputs);
  const boundarySuggestion = extractBoundarySuggestion(agentOutputs);
  const releaseOpsActions = extractReleaseOpsActions(agentOutputs);
  const clarificationQuestions = buildClarificationQuestionsOp({
    guardrail: finalContextGuardrail,
    unknownSignalCount,
    unknownSignalThreshold: CONTEXT_GUARDRAILS.unknownSignalThreshold,
    strategy: excerptPayload.strategy,
    diffLocations
  });
  const llmPromptContextLength = finalAgentPlan.prompts.reduce((total, prompt) => total + prompt.systemPrompt.length + prompt.userPrompt.length, 0);
  const finalLifecycleAction = applyLifecycleTransitionOp(transitionIteration, iterationId, normalized.status, finalAgentPlan.recommendedTransition, input.autoTransition === true);
  const currentChangeControl = normalized.changeControl ?? defaultIterationChangeControl();
  const currentBoundary = currentChangeControl.boundary ?? defaultIterationChangeControl().boundary;
  const boundaryIsEmpty =
    currentBoundary.requirementRefs.length === 0 &&
    currentBoundary.componentRefs.length === 0 &&
    currentBoundary.codePaths.length === 0 &&
    !currentBoundary.note;
  const resolvedBoundary =
    boundarySuggestion && boundaryIsEmpty
      ? {
          requirementRefs: boundarySuggestion.requirementRefs,
          componentRefs: boundarySuggestion.componentRefs,
          codePaths: boundarySuggestion.codePaths,
          note: boundarySuggestion.note || "由 boundary-guardian 自动建议，待人工确认。",
          updatedAt: new Date().toISOString()
        }
      : currentBoundary;
  const generatedAt = new Date().toISOString();
  const existingMaterializedFiles = Array.isArray(currentChangeControl.qualityArtifacts?.materializedFiles)
    ? currentChangeControl.qualityArtifacts.materializedFiles
    : [];
  const resolvedQualityArtifacts = {
    ...qualityArtifacts,
    materializedFiles: existingMaterializedFiles
  };
  let executableConstraintsState = {
    componentWhitelist: resolvedBoundary.componentRefs.slice(0, 24),
    codePathWhitelist: resolvedBoundary.codePaths.slice(0, 24),
    acceptanceChecks: Array.from(new Set([...normalized.scope.acceptanceCriteria, ...qualityArtifacts.acceptanceChecklist])).slice(0, 24)
  };
  let executableConstraints = {
    ...executableConstraintsState,
    gateRules: [
      "仅允许改动 codePathWhitelist 内文件。",
      "发布前测试矩阵不得存在 failed/blocked。",
      "生产环境需 releaseReview=go 且验收清单非空。"
    ]
  };
  normalized.changeControl = {
    ...currentChangeControl,
    pendingHumanConfirmation: true,
    lastAnalysisAt: generatedAt,
    lastAnalysisFileName: input.fileName,
    lastAnalysisDigest: `added=${added.length};removed=${removed.length};diff=${diffLocations.length};strategy=${excerptPayload.strategy};chunks=${Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0};degraded=${finalContextGuardrail.degraded ? "yes" : "no"}${finalContextGuardrail.reason ? `;reason=${finalContextGuardrail.reason}` : ""};policyRisk=${executionPolicy.promptBudgetRisk}`,
    clarificationQuestions,
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: generatedAt,
    lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: clarificationQuestions, updatedAt: generatedAt },
    lastClarificationNote: "",
    confirmedAt: "",
    confirmedBy: "",
    boundary: resolvedBoundary,
    generatedTestMatrix,
    generatedTestMatrixUpdatedAt: generatedTestMatrix.length > 0 ? generatedAt : "",
    testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: {
      ...resolvedQualityArtifacts,
      updatedAt: generatedAt
    },
    uxArtifacts: {
      ...uxArtifacts,
      updatedAt: generatedAt
    },
    executableConstraints: {
      ...executableConstraintsState,
      generatedAt
    }
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "attachment_analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
  if (generatedTestMatrix.length > 0) {
    writeAuditLog(repo, "iteration_test_matrix_generated", `iteration:${iterationId}`, `cases=${generatedTestMatrix.length}`);
  }
  markStage("synthesis:attachment-insights");
  const attachmentInsights = await synthesizeAttachmentInsightsOp(agentRunner, {
    iterationName: normalized.name,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text,
    versionDiff: { added, changed, removed },
    diffLocations,
    visionPayloads
  });
  markStage("synthesis:project-profile-primary");
  const synthesis = await synthesizeProjectProfileOp(
    agentRunner,
    {
      iterationName: normalized.name,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
      excerpt: excerptPayload.text,
      fileStats: excerptPayload.fileStats,
      versionDiff: { added, changed, removed },
      agentOutputs,
      contextLabel: "primary",
      visionPayloads,
      contextMode: "primary"
    },
    { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG }
  );
  markStage("synthesis:project-profile-batches");
  const batchSyntheses = excerptPayload.batchContexts.length
    ? await Promise.all(
        excerptPayload.batchContexts.map((batchContext, index) =>
          synthesizeProjectProfileOp(
            agentRunner,
            {
              iterationName: normalized.name,
              sourceType: input.sourceType === "folder" ? "folder" : "single-file",
              analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
              excerpt: batchContext,
              fileStats: excerptPayload.fileStats,
              versionDiff: { added, changed, removed },
              agentOutputs,
              contextLabel: `batch-${index + 1}`,
              visionPayloads,
              contextMode: "supplemental"
            },
            { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG }
          )
        )
      )
    : [];
  const mergedSynthesis = mergeSynthesisResultsOp(
    {
      projectDetection: {
        ...synthesis.projectDetection,
        confidence: synthesis.projectDetection.confidence || "low"
      },
      meaningfulFindings: synthesis.meaningfulFindings,
      prioritizedFindings: synthesis.prioritizedFindings,
      nextActions: synthesis.nextActions
    },
    batchSyntheses
  );
  const resolvedProjectDetectionWithPaths = {
    ...mergedSynthesis.projectDetection,
    evidence: Array.from(new Set(mergedSynthesis.projectDetection.evidence)).slice(0, 5)
  };
  const resolvedMeaningfulFindings = mergedSynthesis.meaningfulFindings;
  const resolvedPrioritizedFindings = mergedSynthesis.prioritizedFindings;
  const resolvedNextActions = mergedSynthesis.nextActions;
  const finalNextActions = Array.from(new Set([...resolvedNextActions, ...releaseOpsActions].map((item) => item.trim()).filter(Boolean))).slice(0, 12);
  const resolvedBoundaryForReport = normalized.changeControl?.boundary ?? currentChangeControl.boundary;
  const reportBoundaryRequirements =
    resolvedBoundaryForReport?.requirementRefs?.length > 0 ? resolvedBoundaryForReport.requirementRefs : normalized.scope.inScope.slice(0, 12);
  markStage("synthesis:deep-business-governance");
  const [deepInsights, businessConfirmation, governanceInsights] = await Promise.all([
    synthesizeDeepInsightsOp(agentRunner, {
      input,
      excerptPayload,
      prioritizedFindings: resolvedPrioritizedFindings,
      clarificationQuestions
    }),
    synthesizeBusinessConfirmationOp(
      agentRunner,
      {
        iterationName: normalized.name,
        baselineIterationName: previous?.name ?? "无基线",
        analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        excerpt: excerptPayload.text,
        requirements: reportBoundaryRequirements,
        components: resolvedBoundaryForReport?.componentRefs ?? [],
        codePaths: resolvedBoundaryForReport?.codePaths ?? [],
        clarificationQuestions,
        versionDiff: { added, changed, removed },
        diffLocations,
        prioritizedFindings: resolvedPrioritizedFindings,
        visionPayloads
      },
      { runAnalysisPrompt }
    ),
    synthesizeGovernanceInsightsOp(
      agentRunner,
      {
        iterationName: normalized.name,
        baselineIterationName: previous?.name ?? "无基线",
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        excerpt: excerptPayload.text,
        diffLocations,
        added,
        changed,
        removed,
        requirements: reportBoundaryRequirements.slice(0, 8),
        components: resolvedBoundaryForReport?.componentRefs ?? [],
        codePaths: resolvedBoundaryForReport?.codePaths ?? [],
        prioritizedFindings: resolvedPrioritizedFindings,
        clarificationQuestions
      },
      { runAnalysisPrompt }
    )
  ]);
  const businessConfirmationWithUx = {
    ...businessConfirmation,
    interactionInsights: {
      ...businessConfirmation.interactionInsights,
      primaryFlow: Array.from(new Set([...businessConfirmation.interactionInsights.primaryFlow, ...uxArtifacts.interactionFlows])).slice(0, 12),
      keyInteractions: Array.from(new Set([...businessConfirmation.interactionInsights.keyInteractions, ...uxArtifacts.uxConstraints])).slice(0, 14),
      exceptionPaths: Array.from(new Set([...businessConfirmation.interactionInsights.exceptionPaths, ...uxArtifacts.uiStates])).slice(0, 12)
    }
  };
  markStage("synthesis:report-quality");
  const reportQuality = await synthesizeReportQualityGateOp(
    agentRunner,
    {
      iterationName: normalized.name,
      analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      deepInsights,
      businessConfirmation: businessConfirmationWithUx,
      prioritizedFindings: resolvedPrioritizedFindings,
      clarificationQuestions
    },
    { runAnalysisPrompt }
  );
  const releaseOpsStructured = extractReleaseOpsStructured(agentOutputs);
  const qaReleaseReview = extractReleaseReview(agentOutputs);
  const traceabilityMap = governanceInsights.traceabilityMap;
  const domainKnowledge = governanceInsights.domainKnowledge;
  const versionDiffDetailed = governanceInsights.versionDiffDetailed;
  executableConstraints = governanceInsights.executableConstraints;
  executableConstraintsState = {
    componentWhitelist: executableConstraints.componentWhitelist.slice(0, 24),
    codePathWhitelist: executableConstraints.codePathWhitelist.slice(0, 24),
    acceptanceChecks: executableConstraints.acceptanceChecks.slice(0, 24)
  };
  const opsRollbackReason = releaseOpsStructured.rollbackDecision.reason;
  const opsRollbackTrigger = releaseOpsStructured.rollbackDecision.trigger;
  markStage("synthesis:release-review");
  const releaseReviewSynthesized = await synthesizeReleaseReviewOp(
    agentRunner,
    {
      iterationName: normalized.name,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      excerpt: excerptPayload.text,
      prioritizedFindings: resolvedPrioritizedFindings,
      blockers: qaReleaseReview.blockers,
      releaseGates: qaReleaseReview.releaseGates,
      rollbackPlan: qaReleaseReview.rollbackPlan,
      recommendations: finalNextActions.slice(0, 8),
      qualitySignals: {
        testCaseCount: generatedTestMatrix.length,
        p0FindingCount: resolvedPrioritizedFindings.filter((item) => item.priority === "P0").length,
        unknownSignalCount,
        boundaryCoverage: traceabilityMap.coverageScore
      }
    },
    { runAnalysisPrompt }
  );
  const releaseReview = {
    decision: releaseReviewSynthesized.decision,
    reason: releaseReviewSynthesized.reason,
    blockers: releaseReviewSynthesized.blockers,
    releaseGates: releaseReviewSynthesized.releaseGates,
    recommendations: releaseReviewSynthesized.recommendations,
    rollback: {
      shouldRollback: releaseReviewSynthesized.rollback.shouldRollback,
      reason: releaseReviewSynthesized.rollback.reason || opsRollbackReason,
      trigger: releaseReviewSynthesized.rollback.trigger || opsRollbackTrigger,
      actions: releaseReviewSynthesized.rollback.actions
    },
    qualitySignals: releaseReviewSynthesized.qualitySignals
  };
  const releaseReviewScore = releaseReviewSynthesized.score;
  const opsRollbackLabel = releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚";
  const opsRollbackReasonText = releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : "";
  const opsTriage = {
    hypotheses: releaseOpsStructured.hypotheses,
    triageSteps: releaseOpsStructured.triageSteps,
    rollbackSuggestion: `回滚建议：${opsRollbackLabel}${opsRollbackReasonText}`
  };
  const analysisP0Count = resolvedPrioritizedFindings.filter((item) => item.priority === "P0").length;
  markStage("finalize:report");
  const analysisHighValueCount = resolvedPrioritizedFindings.filter((item) => item.priority === "P0" || item.priority === "P1").length;
  const analysisConsideredFiles = excerptPayload.fileSelection.consideredFiles;
  const analysisIgnoredFiles = excerptPayload.fileSelection.ignoredFiles.length;
  const analysisIgnoredRatio = analysisConsideredFiles === 0 ? 0 : Math.round((analysisIgnoredFiles / analysisConsideredFiles) * 100);

  normalized.changeControl = {
    ...(normalized.changeControl ?? currentChangeControl),
    lastAnalysisP0Count: analysisP0Count,
    lastAnalysisHighValueCount: analysisHighValueCount,
    lastAnalysisConsideredFiles: analysisConsideredFiles,
    lastAnalysisIgnoredFiles: analysisIgnoredFiles,
    lastAnalysisIgnoredFileRatio: analysisIgnoredRatio,
    lastReleaseReviewDecision: releaseReview.decision,
    lastReleaseReviewReason: releaseReview.reason,
    lastReleaseReviewBlockers: releaseReview.blockers,
    lastReleaseReviewScore: releaseReviewScore,
    lastReleaseReviewUpdatedAt: generatedAt,
    lastTraceabilityCoverageScore: traceabilityMap.coverageScore,
    lastOpsRollbackSuggested: releaseReview.rollback.shouldRollback,
    lastReportPublishable: reportQuality.publishable,
    lastReportQualityScore: reportQuality.score,
    lastReportQualitySummary: reportQuality.summary,
    lastReportQualityUpdatedAt: generatedAt,
    uxArtifacts: {
      ...uxArtifacts,
      updatedAt: generatedAt
    },
    executableConstraints: {
      ...executableConstraintsState,
      generatedAt
    },
    traceabilitySnapshot: {
      requirementCoverage: traceabilityMap.coverageScore,
      mappingConfidence: traceabilityMap.mappingConfidence,
      unmappedRequirements: traceabilityMap.unmappedRequirements,
      conflicts: traceabilityMap.conflicts,
      generatedAt
    },
    domainKnowledgeEntries: domainKnowledge.terms.map((item) => ({
      term: item.term,
      definition: item.definition,
      mappedPages: item.mappedTo.pages,
      mappedApis: item.mappedTo.apis,
      mappedEntities: item.mappedTo.entities,
      mappedCodePaths: item.mappedTo.codePaths,
      evidence: item.evidence
    })),
    domainKnowledgeUpdatedAt: generatedAt
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "attachment_project_detection_synthesized", `iteration:${iterationId}`, `target=${input.fileName}`);
  const synthesisOutputs = [
    synthesis.synthesisOutput,
    ...batchSyntheses.map((item) => item.synthesisOutput)
  ].filter(Boolean) as IterationAgentOutput[];
  const outputList = synthesisOutputs.length > 0 ? [...agentOutputs, ...synthesisOutputs] : agentOutputs;
  const reportPayloadIssues = collectLlmBackedReportPayloadIssues({
    projectDetection: resolvedProjectDetectionWithPaths,
    meaningfulFindings: resolvedMeaningfulFindings,
    prioritizedFindings: resolvedPrioritizedFindings,
    nextActions: finalNextActions,
    businessConfirmation: businessConfirmationWithUx,
    reportQuality,
    outputList
  });
  if (reportPayloadIssues.length > 0) {
    throw new LlmInvocationError(`report_not_llm_quality: ${reportPayloadIssues.join(", ")}`);
  }
  const llmModels = Array.from(new Set(outputList.map((item: IterationAgentOutput) => (item.model || "").trim()).filter(Boolean)));
  const finalRisks = Array.from(
    new Set([
      ...versionDiffDetailed.riskPoints.filter((item) => !isLowSignalText(item)),
      ...resolvedPrioritizedFindings
        .filter((item) => item.priority === "P0" || item.priority === "P1")
        .map((item) => item.reason)
        .filter((item: string) => !isLowSignalText(item))
    ])
  ).slice(0, 12);
  const finalSuggestions = Array.from(
    new Set([
      ...reportQuality.actionRequired.filter((item) => !isLowSignalText(item)),
      ...releaseReview.recommendations.filter((item) => !isLowSignalText(item)),
      ...finalNextActions.filter((item) => !isLowSignalText(item)),
      ...releaseOpsActions.filter((item) => !isLowSignalText(item)),
      ...attachmentInsights.limitations.filter((item) => !isLowSignalText(item)),
      ...uxArtifacts.uxConstraints.filter((item) => !isLowSignalText(item))
    ])
  ).slice(0, 16);
  writeAuditLog(
    repo,
    "attachment_llm_trace",
    `iteration:${iterationId}`,
    `models=${llmModels.join("|") || "unknown"};outputs=${outputList.length};target=${input.fileName}`
  );
  return {
    iterationId: normalized.id,
    iterationName: normalized.name,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
    fileStats: excerptPayload.fileStats,
    fileSelection: excerptPayload.fileSelection,
    projectDetection: resolvedProjectDetectionWithPaths,
    meaningfulFindings: resolvedMeaningfulFindings,
    prioritizedFindings: resolvedPrioritizedFindings,
    nextActions: finalNextActions,
    analyzedAt: generatedAt,
    attachmentInsights,
    llmContext: {
      strategy: excerptPayload.strategy,
      digest: excerptPayload.digest,
      excerptLength: excerptPayload.text.length,
      chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
      promptContextLength: llmPromptContextLength,
      agentCount: finalAgentPlan.prompts.length,
      unknownSignalCount,
      degraded: finalContextGuardrail.degraded,
      degradeReason: finalContextGuardrail.reason
    },
    clarificationQuestions,
    understanding: [
      businessConfirmationWithUx.coreIntent,
      businessConfirmationWithUx.versionDiffSummary,
      resolvedPrioritizedFindings.length > 0 ? `优先关注：${resolvedPrioritizedFindings[0].content}` : ""
    ]
      .filter((item) => item && item.trim().length > 0)
      .join(" "),
    versionDiff: { baselineIterationName: previous?.name ?? "无基线", added, changed, removed },
    versionDiffDetailed,
    diffLocations,
    cyclePhase: inferCyclePhase(normalized.status),
    agentPlan: finalAgentPlan,
    agentOutputs: outputList,
    lifecycleAction: finalLifecycleAction,
    risks: finalRisks,
    traceabilityMap,
    executableConstraints,
    releaseReview,
    qualityArtifacts: resolvedQualityArtifacts,
    uxArtifacts,
    domainKnowledge,
    opsTriage,
    businessConfirmation: businessConfirmationWithUx,
    deepInsights,
    reportQuality,
    suggestions: finalSuggestions
  };
}
