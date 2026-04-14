import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { LlmInvocationError, type AgentRunner } from '../shared/agentRunner';
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  IterationStatus,
  IterationTransitionSource,
} from '../../../domain/workspace/types';
import { extractKnowledgeBaseUpdateOp } from '../project/ontologyService';
import { buildKnowledgeSyncContext } from '../project/knowledgeSyncService';
import { createLogger as createOntologyLogger } from '../../../infrastructure/runtime/logger';
import {
  buildDiffLocations,
  buildIterationAgentPlan,
  inferCyclePhase,
  normalizeIteration,
  shouldUseCompactSingleFileAnalysis
} from '../shared/workspaceSupport';
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
} from './extractors';
import { buildClarificationQuestionsOp, mergeSynthesisResultsOp } from './synthesisOps';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import { composeAttachmentExcerpt, resolveVisionPayloads } from './inputOps';
import {
  synthesizeBusinessConfirmationOp,
  synthesizeGovernanceInsightsOp,
  synthesizeReleaseReviewOp,
  synthesizeReportQualityGateOp
} from './governanceRunnerOps';
import { synthesizeProjectProfileOp } from './projectProfileRunnerOps';
import { CONTEXT_GUARDRAILS, SYNTHESIS_LLM_CONFIG, runAnalysisPrompt } from './configOps';
import { ensureArtifactWorkflow } from '../changeControl/artifactWorkflow';
import { commitIterationArtifactOp, confirmIterationArtifactOp } from '../changeControl/artifactOps';
import { isSubstantiveContent } from '../changeControl/artifactDraftSynthesizer';
import {
  synthesizeExecutionPolicyOp,
  synthesizeFolderSelectionOp,
  synthesizeDeepInsightsOp,
  executeAgentPlanOp,
  synthesizeAttachmentInsightsOp
} from './synthesisTaskOps';

// ── Lifecycle transition helper ──

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
    source: "auto", reason: "Agent 自动驱动流转", operator: "agent-runner", operatorRole: "system"
  });
  if (result.ok) {
    return { attempted: true, applied: true, fromStatus, toStatus, note: `已自动流转：${fromStatus} -> ${toStatus}` };
  }
  return { attempted: true, applied: false, fromStatus, toStatus, note: `自动流转失败：${result.reason || "unknown"}` };
}

// ── Phase 1: Preflight — folder选择、excerpt组装、execution policy ──

async function runPreflightPhase(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, markStage: (s: string) => void) {
  const previousScope = previous?.scope.inScope ?? [];
  const currentScope = normalized.scope.inScope;
  markStage("preflight:folder-selection");
  const folderSelection = input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
    ? await synthesizeFolderSelectionOp(agentRunner, input) : null;
  const excerptPayload = composeAttachmentExcerpt(input, CONTEXT_GUARDRAILS, folderSelection);
  const visionPayloads = resolveVisionPayloads(input);
  const added = currentScope.filter((item) => !previousScope.includes(item));
  const removed = previousScope.filter((item) => !currentScope.includes(item));
  const diffLocations = buildDiffLocations(previous, normalized);
  const changed = diffLocations.filter((item) => item.changeType === "changed").map((item) => `${item.dimension}: ${item.currentItem}`);
  const normalizedRisks = normalized.assessment.risks.filter((item) => !isLowSignalText(item));
  markStage("preflight:execution-policy");
  const executionPolicy = await synthesizeExecutionPolicyOp(agentRunner, {
    iterationName: normalized.name, fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerptPayload, chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
    forceMultiAgentHint: input.forceMultiAgent
  });
  const files = Array.isArray(input.files) ? input.files : [];
  const totalFiles = input.sourceType === "folder" ? files.length : 1;
  const hasPrototypeEvidence = visionPayloads.length > 0 || files.some((f) => {
    const mime = (f.mimeType || "").toLowerCase();
    const path = (f.path || f.fileName || "").toLowerCase();
    return mime.startsWith("image/") || /prototype|figma|sketch|xd/.test(path);
  });
  const hasDocumentEvidence = files.length === 0 || files.some((f) => {
    const mime = (f.mimeType || "").toLowerCase();
    const path = (f.path || f.fileName || "").toLowerCase();
    return mime.includes("text") || mime.includes("json") || mime.includes("xml") || mime.includes("markdown") || /\.(md|mdx|txt|doc|docx|pdf|ppt|pptx|xlsx|csv|json|yml|yaml)$/i.test(path);
  });
  return { excerptPayload, visionPayloads, added, changed, removed, diffLocations, normalizedRisks, executionPolicy, hasPrototypeEvidence, hasDocumentEvidence, totalFiles };
}

// ── Phase 2: Agent 执行 + 初始提取 ──

async function runAgentExecutionPhase(agentRunner: AgentRunner | null, repo: WorkspaceRepository, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, pre: Awaited<ReturnType<typeof runPreflightPhase>>, markStage: (s: string) => void) {
  const { excerptPayload, visionPayloads, diffLocations, normalizedRisks, hasPrototypeEvidence, hasDocumentEvidence, totalFiles } = pre;
  const projectForKb = repo.findProject(normalized.projectId);
  const kbSummary = buildKnowledgeSyncContext(projectForKb?.knowledgeBase ?? null, { maxChars: 2000 });
  const finalAgentPlan = buildIterationAgentPlan({
    iteration: normalized, previous, scope: input.agentScope ?? "full-cycle",
    diffLocations, risks: normalizedRisks, fileName: input.fileName,
    attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
    attachmentSignals: { sourceType: input.sourceType === "folder" ? "folder" : "single-file", hasPrototypeEvidence, hasDocumentEvidence, totalFiles },
    knowledgeBaseSummary: kbSummary || undefined
  });
  const skipExecution = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: { sourceType: input.sourceType === "folder" ? "folder" : "single-file", hasPrototypeEvidence, hasDocumentEvidence, totalFiles }
  });
  let agentOutputs: IterationAgentOutput[] = [];
  if (skipExecution) { markStage("analysis:agent-plan-skipped"); }
  else { markStage("analysis:agent-plan"); agentOutputs = await executeAgentPlanOp(agentRunner, finalAgentPlan.prompts, visionPayloads); }
  const unknownSignalCount = agentOutputs.reduce((total, o) => total + (o.content.toLowerCase().match(/unknown/g)?.length ?? 0), 0);
  return { finalAgentPlan, agentOutputs, unknownSignalCount };
}

// ── Phase 3: 合成管道 ──

async function runSynthesisPipeline(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, pre: Awaited<ReturnType<typeof runPreflightPhase>>, exec: Awaited<ReturnType<typeof runAgentExecutionPhase>>, clarificationQuestions: string[], uxArtifacts: ReturnType<typeof extractUxArtifacts>, releaseOpsActions: string[], markStage: (s: string) => void) {
  const { excerptPayload, visionPayloads, added, changed, removed, diffLocations } = pre;
  const { agentOutputs } = exec;
  const analyzedTarget = input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName;

  markStage("synthesis:attachment-insights");
  const attachmentInsights = await synthesizeAttachmentInsightsOp(agentRunner, {
    iterationName: normalized.name, fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text, versionDiff: { added, changed, removed }, diffLocations, visionPayloads
  });

  markStage("synthesis:project-profile-primary");
  const synthesis = await synthesizeProjectProfileOp(agentRunner, {
    iterationName: normalized.name, sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    analyzedTarget, excerpt: excerptPayload.text, fileStats: excerptPayload.fileStats,
    versionDiff: { added, changed, removed }, agentOutputs, contextLabel: "primary", visionPayloads, contextMode: "primary"
  }, { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG });

  markStage("synthesis:project-profile-batches");
  const batchSyntheses = excerptPayload.batchContexts.length
    ? await Promise.all(excerptPayload.batchContexts.map((batchContext, index) =>
        synthesizeProjectProfileOp(agentRunner, {
          iterationName: normalized.name, sourceType: input.sourceType === "folder" ? "folder" : "single-file",
          analyzedTarget, excerpt: batchContext, fileStats: excerptPayload.fileStats,
          versionDiff: { added, changed, removed }, agentOutputs, contextLabel: `batch-${index + 1}`, visionPayloads, contextMode: "supplemental"
        }, { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG })))
    : [];
  const mergedSynthesis = mergeSynthesisResultsOp({
    projectDetection: { ...synthesis.projectDetection, confidence: synthesis.projectDetection.confidence || "low" },
    meaningfulFindings: synthesis.meaningfulFindings, prioritizedFindings: synthesis.prioritizedFindings, nextActions: synthesis.nextActions
  }, batchSyntheses);
  const resolvedProjectDetection = { ...mergedSynthesis.projectDetection, evidence: Array.from(new Set(mergedSynthesis.projectDetection.evidence)).slice(0, 5) };
  const resolvedMeaningfulFindings = mergedSynthesis.meaningfulFindings;
  const resolvedPrioritizedFindings = mergedSynthesis.prioritizedFindings;
  const finalNextActions = Array.from(new Set([...mergedSynthesis.nextActions, ...releaseOpsActions].map((i) => i.trim()).filter(Boolean))).slice(0, 12);

  const resolvedBoundaryForReport = normalized.changeControl?.boundary ?? defaultIterationChangeControl().boundary;
  const reportBoundaryRequirements = resolvedBoundaryForReport?.requirementRefs?.length > 0 ? resolvedBoundaryForReport.requirementRefs : normalized.scope.inScope.slice(0, 12);

  markStage("synthesis:deep-business-governance");
  const [deepInsights, businessConfirmation, governanceInsights] = await Promise.all([
    synthesizeDeepInsightsOp(agentRunner, { input, excerptPayload, prioritizedFindings: resolvedPrioritizedFindings, clarificationQuestions }),
    synthesizeBusinessConfirmationOp(agentRunner, {
      iterationName: normalized.name, baselineIterationName: previous?.name ?? "无基线", analyzedTarget,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      excerpt: excerptPayload.text, requirements: reportBoundaryRequirements,
      components: resolvedBoundaryForReport?.componentRefs ?? [], codePaths: resolvedBoundaryForReport?.codePaths ?? [],
      clarificationQuestions, versionDiff: { added, changed, removed }, diffLocations,
      prioritizedFindings: resolvedPrioritizedFindings, visionPayloads
    }, { runAnalysisPrompt }),
    synthesizeGovernanceInsightsOp(agentRunner, {
      iterationName: normalized.name, baselineIterationName: previous?.name ?? "无基线",
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      excerpt: excerptPayload.text, diffLocations, added, changed, removed,
      requirements: reportBoundaryRequirements.slice(0, 8),
      components: resolvedBoundaryForReport?.componentRefs ?? [], codePaths: resolvedBoundaryForReport?.codePaths ?? [],
      prioritizedFindings: resolvedPrioritizedFindings, clarificationQuestions
    }, { runAnalysisPrompt })
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
  const synthesisOutputs = [synthesis.synthesisOutput, ...batchSyntheses.map((item) => item.synthesisOutput)].filter(Boolean) as IterationAgentOutput[];
  return { attachmentInsights, resolvedProjectDetection, resolvedMeaningfulFindings, resolvedPrioritizedFindings, finalNextActions, businessConfirmationWithUx, governanceInsights, deepInsights, synthesisOutputs };
}

// ── Phase 4: 质量门 + 发布评审 ──

async function runQualityGatePhase(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, pre: Awaited<ReturnType<typeof runPreflightPhase>>, exec: Awaited<ReturnType<typeof runAgentExecutionPhase>>, syn: Awaited<ReturnType<typeof runSynthesisPipeline>>, clarificationQuestions: string[], markStage: (s: string) => void) {
  const { excerptPayload } = pre;
  const { agentOutputs, unknownSignalCount } = exec;
  const { resolvedPrioritizedFindings, finalNextActions, businessConfirmationWithUx, governanceInsights, deepInsights } = syn;
  const analyzedTarget = input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName;

  markStage("synthesis:report-quality");
  const reportQuality = await synthesizeReportQualityGateOp(agentRunner, {
    iterationName: normalized.name, analyzedTarget,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    deepInsights, businessConfirmation: businessConfirmationWithUx,
    prioritizedFindings: resolvedPrioritizedFindings, clarificationQuestions
  }, { runAnalysisPrompt });

  const releaseOpsStructured = extractReleaseOpsStructured(agentOutputs);
  const qaReleaseReview = extractReleaseReview(agentOutputs);
  const traceabilityMap = governanceInsights.traceabilityMap;
  const domainKnowledge = governanceInsights.domainKnowledge;
  const versionDiffDetailed = governanceInsights.versionDiffDetailed;
  const executableConstraints = governanceInsights.executableConstraints;

  markStage("synthesis:release-review");
  const releaseReviewSynthesized = await synthesizeReleaseReviewOp(agentRunner, {
    iterationName: normalized.name, sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text, prioritizedFindings: resolvedPrioritizedFindings,
    blockers: qaReleaseReview.blockers, releaseGates: qaReleaseReview.releaseGates,
    rollbackPlan: qaReleaseReview.rollbackPlan, recommendations: finalNextActions.slice(0, 8),
    qualitySignals: {
      testCaseCount: exec.finalAgentPlan.prompts.length, // placeholder, corrected by caller
      p0FindingCount: resolvedPrioritizedFindings.filter((i) => i.priority === "P0").length,
      unknownSignalCount, boundaryCoverage: traceabilityMap.coverageScore,
      ontologyTermCount: domainKnowledge?.terms?.length ?? 0, ontologyRuleCount: domainKnowledge?.rules?.length ?? 0
    }
  }, { runAnalysisPrompt });

  const opsRollbackReason = releaseOpsStructured.rollbackDecision.reason;
  const opsRollbackTrigger = releaseOpsStructured.rollbackDecision.trigger;
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
  const opsRollbackLabel = releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚";
  const opsRollbackReasonText = releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : "";
  const opsTriage = {
    hypotheses: releaseOpsStructured.hypotheses,
    triageSteps: releaseOpsStructured.triageSteps,
    rollbackSuggestion: `回滚建议：${opsRollbackLabel}${opsRollbackReasonText}`
  };
  return { reportQuality, releaseReview, releaseReviewScore: releaseReviewSynthesized.score, opsTriage, traceabilityMap, domainKnowledge, versionDiffDetailed, executableConstraints };
}

// ── Phase 5: 知识回写 + 本体提取 ──

function writebackKnowledgeState(repo: WorkspaceRepository, iteration: { projectId: number }, normalized: ReturnType<typeof normalizeIteration>, pre: Awaited<ReturnType<typeof runPreflightPhase>>, syn: Awaited<ReturnType<typeof runSynthesisPipeline>>, qg: Awaited<ReturnType<typeof runQualityGatePhase>>, generatedAt: string, uxArtifacts: ReturnType<typeof extractUxArtifacts>, _generatedTestMatrix: ReturnType<typeof extractGeneratedTestMatrix>, markStage: (s: string) => void) {
  const { excerptPayload } = pre;
  const { resolvedPrioritizedFindings, resolvedMeaningfulFindings, businessConfirmationWithUx, deepInsights } = syn;
  const { reportQuality, releaseReview, releaseReviewScore, traceabilityMap, domainKnowledge, versionDiffDetailed, executableConstraints } = qg;
  const currentChangeControl = normalized.changeControl ?? defaultIterationChangeControl();

  const analysisP0Count = resolvedPrioritizedFindings.filter((i) => i.priority === "P0").length;
  const analysisHighValueCount = resolvedPrioritizedFindings.filter((i) => i.priority === "P0" || i.priority === "P1").length;
  const analysisConsideredFiles = excerptPayload.fileSelection.consideredFiles;
  const analysisIgnoredFiles = excerptPayload.fileSelection.ignoredFiles.length;
  const analysisIgnoredRatio = analysisConsideredFiles === 0 ? 0 : Math.round((analysisIgnoredFiles / analysisConsideredFiles) * 100);

  markStage("finalize:report");
  const execConstraintsState = {
    componentWhitelist: executableConstraints.componentWhitelist.slice(0, 24),
    codePathWhitelist: executableConstraints.codePathWhitelist.slice(0, 24),
    acceptanceChecks: executableConstraints.acceptanceChecks.slice(0, 24)
  };

  // 边界回填：Phase 2 的 boundary-guardian 可能未运行（compact single-file / agent 跳过），
  // 此时 boundary 为空，需从 Phase 3/4 的治理分析结果自动填充
  const prevBoundary = currentChangeControl.boundary ?? defaultIterationChangeControl().boundary;
  const enrichedBoundary = { ...prevBoundary };
  if (prevBoundary.requirementRefs.length === 0) {
    const fromBiz = [
      ...(businessConfirmationWithUx.functionalPoints || []),
      ...(businessConfirmationWithUx.necessityAssessment?.mustDo || [])
    ].filter(Boolean);
    const fromTrace = (traceabilityMap.requirementToComponent || [])
      .map((r: { requirement?: string }) => String(r?.requirement || "")).filter(Boolean);
    enrichedBoundary.requirementRefs = Array.from(new Set([...fromBiz, ...fromTrace])).slice(0, 20);
  }
  if (prevBoundary.componentRefs.length === 0) {
    const fromTrace = Array.from(new Set(
      (traceabilityMap.requirementToComponent || [])
        .flatMap((r: { components?: string[] }) => r?.components || [])
    )).filter(Boolean);
    enrichedBoundary.componentRefs = Array.from(new Set([
      ...fromTrace, ...execConstraintsState.componentWhitelist
    ])).slice(0, 20);
  }
  if (prevBoundary.codePaths.length === 0) {
    enrichedBoundary.codePaths = execConstraintsState.codePathWhitelist.slice(0, 20);
  }
  const boundaryWasEnriched =
    enrichedBoundary.requirementRefs.length > prevBoundary.requirementRefs.length ||
    enrichedBoundary.componentRefs.length > prevBoundary.componentRefs.length ||
    enrichedBoundary.codePaths.length > prevBoundary.codePaths.length;
  if (boundaryWasEnriched) {
    enrichedBoundary.note = enrichedBoundary.note || "由分析管道从治理分析结果自动填充，待人工确认。";
    enrichedBoundary.updatedAt = generatedAt;
  }

  normalized.changeControl = {
    ...currentChangeControl,
    boundary: enrichedBoundary,
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
    uxArtifacts: { ...uxArtifacts, updatedAt: generatedAt },
    executableConstraints: { ...execConstraintsState, generatedAt },
    traceabilitySnapshot: {
      requirementCoverage: traceabilityMap.coverageScore,
      mappingConfidence: traceabilityMap.mappingConfidence,
      unmappedRequirements: traceabilityMap.unmappedRequirements,
      conflicts: traceabilityMap.conflicts,
      generatedAt
    },
    domainKnowledgeEntries: domainKnowledge.terms.map((item) => ({
      term: item.term, definition: item.definition,
      mappedPages: item.mappedTo.pages, mappedApis: item.mappedTo.apis,
      mappedEntities: item.mappedTo.entities, mappedCodePaths: item.mappedTo.codePaths,
      evidence: item.evidence
    })),
    domainKnowledgeUpdatedAt: generatedAt,
    lastBusinessConfirmation: {
      coreIntent: (businessConfirmationWithUx.coreIntent || "").slice(0, 2000),
      boundarySummary: (businessConfirmationWithUx.boundarySummary || "").slice(0, 2000),
      functionalPoints: (businessConfirmationWithUx.functionalPoints || []).slice(0, 20),
      successCriteria: (businessConfirmationWithUx.successCriteria || []).slice(0, 10),
      confirmationChecklist: (businessConfirmationWithUx.confirmationChecklist || []).slice(0, 15).map((c: unknown) =>
        typeof c === "string" ? c : typeof c === "object" && c !== null && "item" in c ? String((c as Record<string, unknown>).item) : String(c)
      ),
      versionDiffSummary: (businessConfirmationWithUx.versionDiffSummary || "").slice(0, 2000),
      necessityAssessment: {
        mustDo: (businessConfirmationWithUx.necessityAssessment?.mustDo || []).slice(0, 12),
        shouldDo: (businessConfirmationWithUx.necessityAssessment?.shouldDo || []).slice(0, 12),
        canDefer: (businessConfirmationWithUx.necessityAssessment?.canDefer || []).slice(0, 12),
        outOfScope: (businessConfirmationWithUx.necessityAssessment?.outOfScope || []).slice(0, 12),
        rationale: (businessConfirmationWithUx.necessityAssessment?.rationale || "").slice(0, 2000),
      },
      interactionInsights: {
        primaryFlow: (businessConfirmationWithUx.interactionInsights?.primaryFlow || []).slice(0, 12),
        keyInteractions: (businessConfirmationWithUx.interactionInsights?.keyInteractions || []).slice(0, 14),
        exceptionPaths: (businessConfirmationWithUx.interactionInsights?.exceptionPaths || []).slice(0, 12),
        usabilityRisks: (businessConfirmationWithUx.interactionInsights?.usabilityRisks || []).slice(0, 12),
      },
      diffNarratives: (businessConfirmationWithUx.diffNarratives || []).slice(0, 18),
    },
    lastMeaningfulFindings: resolvedMeaningfulFindings.slice(0, 15),
    lastPrioritizedFindings: resolvedPrioritizedFindings.slice(0, 15).map((f) => ({ priority: f.priority, content: f.content, reason: f.reason })),
    lastDeepInsightsSummary: {
      themes: (deepInsights?.crossFileInsights?.themes || []).slice(0, 10),
      gaps: (deepInsights?.crossFileInsights?.gaps || []).slice(0, 10),
      rootCauses: (deepInsights?.crossFileInsights?.rootCauses || []).slice(0, 8),
      decisionSuggestions: (deepInsights?.crossFileInsights?.decisionSuggestions || []).slice(0, 8)
    }
  };
  repo.updateIteration(normalized);

  const refreshedControl = normalized.changeControl ?? currentChangeControl;
  normalized.changeControl = { ...refreshedControl, artifactWorkflow: ensureArtifactWorkflow(normalized, refreshedControl, generatedAt) };
  repo.updateIteration(normalized);

  // 分析完成后自动提交 clarification 阶段交付物（analysis-report / product-requirements-doc）
  const autoCommitTargets = ["analysis-report", "product-requirements-doc"];
  for (const artifactId of autoCommitTargets) {
    const item = normalized.changeControl!.artifactWorkflow.items.find((i) => i.id === artifactId);
    if (item && item.outputVersion === 0 && isSubstantiveContent(item.draft.content)) {
      commitIterationArtifactOp(repo, normalized.id, artifactId, {
        actor: "analysis-pipeline", summary: item.summary, source: "auto-analysis"
      });
      confirmIterationArtifactOp(repo, normalized.id, artifactId, {
        actor: "analysis-pipeline", passed: true, note: "分析管道自动确认"
      });
      // 刷新 normalized 以反映 commit/confirm 后的状态
      const refreshed = repo.findIteration(normalized.id);
      if (refreshed) {
        const rn = normalizeIteration(refreshed);
        normalized.changeControl = rn.changeControl;
      }
    }
  }

  // 本体提取
  const ontologyLog = createOntologyLogger("ontology-pipeline");
  try {
    const domainKnowledgeEntries = (normalized.changeControl?.domainKnowledgeEntries ?? []).map(e => ({
      term: e.term, definition: e.definition, mappedPages: e.mappedPages, mappedApis: e.mappedApis,
      mappedEntities: e.mappedEntities, mappedCodePaths: e.mappedCodePaths, evidence: e.evidence
    }));
    if (domainKnowledgeEntries.length > 0) {
      const freshProject = repo.findProject(iteration.projectId);
      if (freshProject) {
        const existingKb = freshProject.knowledgeBase ?? { ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: "" };
        const resolvedBoundaryForReport = normalized.changeControl?.boundary ?? defaultIterationChangeControl().boundary;
        const ontologyInput = {
          domainKnowledgeEntries,
          traceabilityMap: traceabilityMap ? {
            pages: traceabilityMap.requirementToComponent.map(r => ({ name: r.requirement, path: r.requirement, components: r.components })),
            apis: traceabilityMap.componentToCode.map(c => ({ path: c.component, method: "GET", description: c.component })),
            entities: domainKnowledgeEntries.filter(e => e.mappedEntities.length > 0).map(e => ({ name: e.term, fields: e.mappedEntities }))
          } : null,
          boundary: resolvedBoundaryForReport ? { codePaths: resolvedBoundaryForReport.codePaths ?? [], requirementRefs: resolvedBoundaryForReport.requirementRefs ?? [] } : null,
          analysisReport: { businessConfirmation: businessConfirmationWithUx, domainKnowledge, versionDiffDetailed, risks: versionDiffDetailed.riskPoints ?? [], releaseReview: { rollback: releaseReview.rollback } }
        };
        const ontologyResult = extractKnowledgeBaseUpdateOp(existingKb, ontologyInput);
        freshProject.knowledgeBase = ontologyResult.updatedKb;
        repo.updateProject(freshProject);
        ontologyLog.info("ontology pipeline completed", { newTerms: ontologyResult.newTerms.length, updatedTerms: ontologyResult.updatedTerms.length, newRules: ontologyResult.newRules.length, newComponents: ontologyResult.newComponents.length });
        writeAuditLog(repo, "ontology.kb-updated", `project:${iteration.projectId}`, `terms=${ontologyResult.newTerms.length}+${ontologyResult.updatedTerms.length};rules=${ontologyResult.newRules.length};components=${ontologyResult.newComponents.length}`);
      }
    }
  } catch (ontologyError) {
    ontologyLog.error("ontology pipeline failed (non-blocking)", { error: ontologyError instanceof Error ? ontologyError.message : String(ontologyError) });
  }
}

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
    throw new LlmInvocationError(`report_not_llm_quality: ${reportPayloadIssues.join(", ")}`);
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
    ].filter((i) => i && i.trim().length > 0).join(" "),
    versionDiff: { baselineIterationName: previous?.name ?? "无基线", added, changed, removed },
    versionDiffDetailed, diffLocations, cyclePhase: inferCyclePhase(normalized.status),
    agentPlan: finalAgentPlan, agentOutputs: outputList, lifecycleAction: finalLifecycleAction,
    risks: finalRisks, traceabilityMap, executableConstraints: { ...executableConstraints, gateRules: ["仅允许改动代码路径白名单内文件。", "发布前测试矩阵不得存在失败或阻断用例。", "生产环境需发布评审通过且验收清单非空。"] },
    releaseReview, qualityArtifacts, uxArtifacts, domainKnowledge, opsTriage,
    businessConfirmation: businessConfirmationWithUx, deepInsights, reportQuality, suggestions: finalSuggestions
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
  const pre = await runPreflightPhase(agentRunner, input, normalized, normalizedPrevious, markStage);

  // Phase 2: Agent 执行
  const exec = await runAgentExecutionPhase(agentRunner, repo, input, normalized, normalizedPrevious, pre, markStage);

  // Extract artifacts from agent outputs
  const generatedTestMatrix = extractGeneratedTestMatrix(exec.agentOutputs);
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
  const resolvedBoundary = boundarySuggestion && boundaryIsEmpty
    ? { requirementRefs: boundarySuggestion.requirementRefs, componentRefs: boundarySuggestion.componentRefs, codePaths: boundarySuggestion.codePaths, note: boundarySuggestion.note || "由 boundary-guardian 自动建议，待人工确认。", updatedAt: new Date().toISOString() }
    : currentBoundary;
  const generatedAt = new Date().toISOString();
  const existingMaterializedFiles = Array.isArray(currentChangeControl.qualityArtifacts?.materializedFiles) ? currentChangeControl.qualityArtifacts.materializedFiles : [];
  const qualityArtifacts = { ...qualityArtifactsRaw, materializedFiles: existingMaterializedFiles };
  const finalLifecycleAction = applyLifecycleTransitionOp(transitionIteration, iterationId, normalized.status, exec.finalAgentPlan.recommendedTransition, input.autoTransition === true);

  normalized.changeControl = {
    ...currentChangeControl,
    pendingHumanConfirmation: true, lastAnalysisAt: generatedAt, lastAnalysisFileName: input.fileName,
    lastAnalysisDigest: `added=${pre.added.length};removed=${pre.removed.length};diff=${pre.diffLocations.length};strategy=${pre.excerptPayload.strategy};chunks=${Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0};degraded=${pre.executionPolicy.degraded ? "yes" : "no"}${pre.executionPolicy.reason ? `;reason=${pre.executionPolicy.reason}` : ""};policyRisk=${pre.executionPolicy.promptBudgetRisk}`,
    clarificationQuestions, clarificationDraftResolvedQuestions: [], clarificationDraftUpdatedAt: generatedAt,
    lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: clarificationQuestions, updatedAt: generatedAt },
    lastClarificationNote: "", confirmedAt: "", confirmedBy: "", boundary: resolvedBoundary,
    generatedTestMatrix, generatedTestMatrixUpdatedAt: generatedTestMatrix.length > 0 ? generatedAt : "", testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: { ...qualityArtifacts, updatedAt: generatedAt },
    uxArtifacts: { ...uxArtifacts, updatedAt: generatedAt },
    executableConstraints: {
      componentWhitelist: resolvedBoundary.componentRefs.slice(0, 24),
      codePathWhitelist: resolvedBoundary.codePaths.slice(0, 24),
      acceptanceChecks: Array.from(new Set([...normalized.scope.acceptanceCriteria, ...qualityArtifactsRaw.acceptanceChecklist])).slice(0, 24),
      generatedAt
    }
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "analysis.attachment-analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
  if (generatedTestMatrix.length > 0) writeAuditLog(repo, "analysis.test-matrix-generated", `iteration:${iterationId}`, `cases=${generatedTestMatrix.length}`);

  // Phase 3: 合成管道
  const syn = await runSynthesisPipeline(agentRunner, input, normalized, normalizedPrevious, pre, exec, clarificationQuestions, uxArtifacts, releaseOpsActions, markStage);

  // Phase 4: 质量门 + 发布评审
  const qg = await runQualityGatePhase(agentRunner, input, normalized, pre, exec, syn, clarificationQuestions, markStage);

  // Phase 5: 知识回写 + 本体
  writebackKnowledgeState(repo, iteration, normalized, pre, syn, qg, generatedAt, uxArtifacts, generatedTestMatrix, markStage);

  // Phase 6: 报告组装
  return assembleAnalysisReport(input, normalized, normalizedPrevious, pre, exec, syn, qg, generatedAt, clarificationQuestions, qualityArtifacts, uxArtifacts, finalLifecycleAction, repo, iterationId);
}
