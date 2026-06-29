/**
 * analysisPipelineOps — 附件分析管道阶段函数
 *
 * 从 analysisOps 拆出的分析管道阶段执行函数：
 * - 预检（文件夹选择/摘要组装/执行策略）
 * - Agent 执行 + 初始提取
 * - 合成管道（附件洞察/项目画像/深度洞察/业务确认/治理洞察）
 * - 质量门 + 发布评审
 * - 知识回写 + 本体提取
 *
 * 阶段间以 ReturnType 链式传递中间态，由 analyzeAttachmentOp 总调度。
 */
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import { createLogger } from '../../../infrastructure/runtime/logger';
import type { AttachmentUploadInput, IterationAgentOutput, VisionPayload } from '../../../domain/workspace/types';
import { buildKnowledgeSyncContext } from '../project/knowledgeSyncService';
// biome-ignore lint/style/useImportType: normalizeIteration 仅 ReturnType<typeof> 用，需 value import
import { buildDiffLocations, buildIterationAgentPlan, normalizeIteration, shouldUseCompactSingleFileAnalysis } from '../shared/workspaceSupport';
// biome-ignore lint/style/useImportType: extractUxArtifacts 仅 ReturnType<typeof> 用，需 value import
import { extractReleaseOpsStructured, extractReleaseReview, extractUxArtifacts, isLowSignalText } from './extractors';
import type { IterationGeneratedTestCase } from '../../../domain/workspace/iterationTypes';
import { mergeSynthesisResultsOp } from './synthesisOps';
import { defaultIterationChangeControl } from '../shared/common';
import { composeAttachmentExcerpt, resolveVisionPayloads } from './inputOps';
import {
  synthesizeBusinessConfirmationOp,
  synthesizeGovernanceInsightsOp,
  synthesizeReleaseReviewOp,
  synthesizeReportQualityGateOp
} from './governanceRunnerOps';
import type { ReleaseReviewPlatformContext } from './releaseReviewOps';
import { synthesizeProjectProfileOp } from './projectProfileRunnerOps';
import { CONTEXT_GUARDRAILS, SYNTHESIS_LLM_CONFIG, runAnalysisPrompt } from './configOps';
import { ensureArtifactWorkflow } from '../changeControl/artifactWorkflow';
import {
  synthesizeExecutionPolicyOp,
  synthesizeFolderSelectionOp,
  synthesizeDeepInsightsOp,
  executeAgentPlanOp,
  synthesizeAttachmentInsightsOp
} from './synthesisTaskOps';
import {
  enrichBoundaryFromGovernance,
  buildAnalysisChangeControlState,
  synthesizeAndPersistDrafts,
  autoCommitClarificationArtifacts,
  runOntologyExtraction,
  isAnalysisDataSufficient
} from './analysisHelpers';

const log = createLogger("analysis-ops");

// ── Phase 1: Preflight — folder选择、excerpt组装、execution policy ──

export async function runPreflightPhase(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, markStage: (s: string) => void) {
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

export async function runAgentExecutionPhase(agentRunner: AgentRunner | null, repo: WorkspaceRepository, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, pre: Awaited<ReturnType<typeof runPreflightPhase>>, markStage: (s: string) => void) {
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

export async function runBatchSynthesisAndMerge(
  agentRunner: AgentRunner | null,
  primary: Awaited<ReturnType<typeof synthesizeProjectProfileOp>>,
  excerptPayload: { batchContexts: string[]; fileStats: { totalFiles: number; textFiles: number; binaryFiles: number } },
  params: { iterationName: string; sourceType: "folder" | "single-file"; analyzedTarget: string; versionDiff: { added: string[]; changed: string[]; removed: string[] }; agentOutputs: IterationAgentOutput[]; visionPayloads: VisionPayload[] },
  releaseOpsActions: string[],
  markStage: (s: string) => void
) {
  markStage("synthesis:project-profile-batch-merge");
  const batchSyntheses = excerptPayload.batchContexts.length
    ? await Promise.all(excerptPayload.batchContexts.map((batchContext, index) =>
        synthesizeProjectProfileOp(agentRunner, {
          iterationName: params.iterationName, sourceType: params.sourceType,
          analyzedTarget: params.analyzedTarget, excerpt: batchContext, fileStats: excerptPayload.fileStats,
          versionDiff: params.versionDiff, agentOutputs: params.agentOutputs, contextLabel: `batch-${index + 1}`,
          visionPayloads: params.visionPayloads, contextMode: "supplemental"
        }, { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG })))
    : [];
  const merged = mergeSynthesisResultsOp({
    projectDetection: { ...primary.projectDetection, confidence: primary.projectDetection.confidence || "low" },
    meaningfulFindings: primary.meaningfulFindings, prioritizedFindings: primary.prioritizedFindings, nextActions: primary.nextActions
  }, batchSyntheses);
  return {
    resolvedProjectDetection: { ...merged.projectDetection, evidence: Array.from(new Set(merged.projectDetection.evidence)).slice(0, 5) },
    resolvedMeaningfulFindings: merged.meaningfulFindings,
    resolvedPrioritizedFindings: merged.prioritizedFindings,
    finalNextActions: Array.from(new Set([...merged.nextActions, ...releaseOpsActions].map((i) => i.trim()).filter(Boolean))).slice(0, 12),
    batchSyntheses
  };
}

export async function runSynthesisPipeline(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, previous: ReturnType<typeof normalizeIteration> | null, pre: Awaited<ReturnType<typeof runPreflightPhase>>, exec: Awaited<ReturnType<typeof runAgentExecutionPhase>>, clarificationQuestions: string[], uxArtifacts: ReturnType<typeof extractUxArtifacts>, releaseOpsActions: string[], markStage: (s: string) => void) {
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
  const { resolvedProjectDetection, resolvedMeaningfulFindings, resolvedPrioritizedFindings, finalNextActions, batchSyntheses } =
    await runBatchSynthesisAndMerge(agentRunner, synthesis, excerptPayload, {
      iterationName: normalized.name, sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      analyzedTarget, versionDiff: { added, changed, removed }, agentOutputs, visionPayloads
    }, releaseOpsActions, markStage);

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

export async function runQualityGatePhase(agentRunner: AgentRunner | null, input: AttachmentUploadInput, normalized: ReturnType<typeof normalizeIteration>, pre: Awaited<ReturnType<typeof runPreflightPhase>>, exec: Awaited<ReturnType<typeof runAgentExecutionPhase>>, syn: Awaited<ReturnType<typeof runSynthesisPipeline>>, clarificationQuestions: string[], platformContext: ReleaseReviewPlatformContext, markStage: (s: string) => void) {
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
    },
    targetPlatforms: platformContext.targetPlatforms,
    testMatrixByPlatform: platformContext.testMatrixByPlatform,
    codePathsByPlatform: platformContext.codePathsByPlatform
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

export async function writebackKnowledgeState(repo: WorkspaceRepository, iteration: { projectId: number }, normalized: ReturnType<typeof normalizeIteration>, pre: Awaited<ReturnType<typeof runPreflightPhase>>, syn: Awaited<ReturnType<typeof runSynthesisPipeline>>, qg: Awaited<ReturnType<typeof runQualityGatePhase>>, generatedAt: string, uxArtifacts: ReturnType<typeof extractUxArtifacts>, _generatedTestMatrix: IterationGeneratedTestCase[], markStage: (s: string) => void, agentRunner: AgentRunner | null) {
  const { excerptPayload } = pre;
  const { resolvedPrioritizedFindings, resolvedMeaningfulFindings, businessConfirmationWithUx, deepInsights } = syn;
  const { reportQuality, releaseReview, releaseReviewScore, traceabilityMap, domainKnowledge, versionDiffDetailed, executableConstraints } = qg;
  const currentChangeControl = normalized.changeControl ?? defaultIterationChangeControl();
  const consideredFiles = excerptPayload.fileSelection.consideredFiles;
  const ignoredFiles = excerptPayload.fileSelection.ignoredFiles.length;
  const metrics = {
    p0Count: resolvedPrioritizedFindings.filter((i) => i.priority === "P0").length,
    highValueCount: resolvedPrioritizedFindings.filter((i) => i.priority === "P0" || i.priority === "P1").length,
    consideredFiles,
    ignoredFiles,
    ignoredRatio: consideredFiles === 0 ? 0 : Math.round((ignoredFiles / consideredFiles) * 100)
  };
  markStage("finalize:report");
  const execConstraintsState = {
    componentWhitelist: executableConstraints.componentWhitelist.slice(0, 24),
    codePathWhitelist: executableConstraints.codePathWhitelist.slice(0, 24),
    acceptanceChecks: executableConstraints.acceptanceChecks.slice(0, 24)
  };
  const prevBoundary = currentChangeControl.boundary ?? defaultIterationChangeControl().boundary;
  const enrichedBoundary = enrichBoundaryFromGovernance(prevBoundary, businessConfirmationWithUx, traceabilityMap, execConstraintsState, generatedAt);

  normalized.changeControl = buildAnalysisChangeControlState(
    currentChangeControl,
    { resolvedPrioritizedFindings, resolvedMeaningfulFindings, businessConfirmationWithUx, deepInsights },
    { reportQuality, releaseReview, releaseReviewScore, traceabilityMap, domainKnowledge, executableConstraints: execConstraintsState },
    metrics, enrichedBoundary, uxArtifacts, generatedAt
  );
  repo.updateIteration(normalized);

  const refreshedControl = normalized.changeControl ?? currentChangeControl;
  normalized.changeControl = { ...refreshedControl, artifactWorkflow: ensureArtifactWorkflow(normalized, refreshedControl, generatedAt) };
  repo.updateIteration(normalized);
  if (!normalized.changeControl) throw new Error("changeControl missing after normalization");
  const activeControl = normalized.changeControl;
  const dataCheck = isAnalysisDataSufficient(activeControl);
  if (dataCheck.sufficient) {
    await synthesizeAndPersistDrafts(agentRunner, repo, normalized, activeControl, generatedAt);
    autoCommitClarificationArtifacts(repo, normalized, activeControl);
  } else {
    log.warn("analysis data insufficient, skipping artifact synthesis", { reasons: dataCheck.reasons.join(", ") });
  }
  const ontologyAnalysisReport = {
    businessConfirmation: businessConfirmationWithUx, domainKnowledge, versionDiffDetailed,
    risks: versionDiffDetailed.riskPoints ?? [], releaseReview: { rollback: releaseReview.rollback }
  };
  runOntologyExtraction(repo, normalized, iteration.projectId, traceabilityMap, ontologyAnalysisReport);
}
