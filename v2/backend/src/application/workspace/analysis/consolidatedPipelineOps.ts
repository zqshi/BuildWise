/**
 * consolidatedPipelineOps — 整合版分析管道 Phase 1-4
 *
 * 当 USE_CONSOLIDATED_AGENTS=true 时，替换 analysisOps 中的旧 14-Agent 管道。
 * 使用 3+1 Agent（Preflight + CoreAnalysis + BizConfirm + QualityAudit）。
 *
 * 每个 exported 函数与 analysisOps 中对应的旧 Phase 函数返回兼容结构，
 * 使 Phase 5（知识回写）和 Phase 6（报告组装）无需修改。
 */

import type { AgentRunner } from '../shared/agentRunner';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentUploadInput,
  IterationAgentOutput,
} from '../../../domain/workspace/types';
import {
  buildDiffLocations,
  buildIterationAgentPlan,
  type normalizeIteration,
} from '../shared/workspaceSupport';
import { composeAttachmentExcerpt, resolveVisionPayloads } from './inputOps';
import { CONTEXT_GUARDRAILS, CHUNK_CONFIG } from './configOps';
import { runPreflightAgent } from './preflightAgentOps';
import { runCoreAnalysisAgent, type CoreAnalysisParams } from './coreAnalysisAgentOps';
import { runBizConfirmAgent, type BizConfirmParams } from './bizConfirmAgentOps';
import { runQualityAuditAgent } from './qualityAuditAgentOps';
import type { ReleaseReviewPlatformContext } from './releaseReviewOps';
import { buildKnowledgeSyncContext } from '../project/knowledgeSyncService';
import { isLowSignalText } from './extractors';

type NormalizedIteration = ReturnType<typeof normalizeIteration>;

// ── Consolidated Phase 1: Preflight ──

export async function consolidatedPreflightPhase(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput,
  normalized: NormalizedIteration,
  previous: NormalizedIteration | null,
  markStage: (s: string) => void
) {
  const previousScope = previous?.scope.inScope ?? [];
  const currentScope = normalized.scope.inScope;

  markStage("preflight:consolidated");

  const preflightResult = await runPreflightAgent(
    agentRunner, input,
    0, // excerptLength — not yet known, preflight handles heuristic fallback
    Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0
  );

  const folderSelection = input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
    ? preflightResult.folderSelection : null;

  const excerptPayload = composeAttachmentExcerpt(input, CONTEXT_GUARDRAILS, folderSelection);
  const visionPayloads = resolveVisionPayloads(input);
  const added = currentScope.filter((item) => !previousScope.includes(item));
  const removed = previousScope.filter((item) => !currentScope.includes(item));
  const diffLocations = buildDiffLocations(previous, normalized);
  const changed = diffLocations.filter((d) => d.changeType === "changed").map((d) => `${d.dimension}: ${d.currentItem}`);
  const normalizedRisks = normalized.assessment.risks.filter((item) => !isLowSignalText(item));

  const executionPolicy = preflightResult.executionPolicy;

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

// ── Consolidated Phase 2: Agent Plan (metadata only, no execution) ──

export async function consolidatedAgentPhase(
  _agentRunner: AgentRunner | null,
  repo: WorkspaceRepository,
  input: AttachmentUploadInput,
  normalized: NormalizedIteration,
  previous: NormalizedIteration | null,
  pre: Awaited<ReturnType<typeof consolidatedPreflightPhase>>,
  markStage: (s: string) => void
) {
  const { excerptPayload, diffLocations, normalizedRisks, hasPrototypeEvidence, hasDocumentEvidence, totalFiles } = pre;
  const projectForKb = repo.findProject(normalized.projectId);
  const kbSummary = buildKnowledgeSyncContext(projectForKb?.knowledgeBase ?? null, { maxChars: 2000 });

  const finalAgentPlan = buildIterationAgentPlan({
    iteration: normalized, previous, scope: input.agentScope ?? "full-cycle",
    diffLocations, risks: normalizedRisks, fileName: input.fileName,
    attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
    attachmentSignals: { sourceType: input.sourceType === "folder" ? "folder" : "single-file", hasPrototypeEvidence, hasDocumentEvidence, totalFiles },
    knowledgeBaseSummary: kbSummary || undefined
  });

  // 整合模式：不执行 Agent Plan，仅保留元数据供 Phase 5/6 使用
  markStage("analysis:consolidated-skip-agent-plan");
  const agentOutputs: IterationAgentOutput[] = [];
  const unknownSignalCount = 0;

  return { finalAgentPlan, agentOutputs, unknownSignalCount };
}

// ── Consolidated Phase 3: Core Analysis + BizConfirm ──

export async function consolidatedSynthesisPhase(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput,
  normalized: NormalizedIteration,
  previous: NormalizedIteration | null,
  pre: Awaited<ReturnType<typeof consolidatedPreflightPhase>>,
  _exec: Awaited<ReturnType<typeof consolidatedAgentPhase>>,
  clarificationQuestions: string[],
  uxArtifacts: { interactionFlows: string[]; uxConstraints: string[]; uiStates: string[] },
  releaseOpsActions: string[],
  markStage: (s: string) => void
) {
  const { excerptPayload, visionPayloads, added, changed, removed, diffLocations } = pre;
  const analyzedTarget = input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName;
  const resolvedBoundary = normalized.changeControl?.boundary;
  const reportBoundaryRequirements = resolvedBoundary?.requirementRefs?.length
    ? resolvedBoundary.requirementRefs
    : normalized.scope.inScope.slice(0, 12);

  // ── Core Analysis Agent（合并 7 个旧 Agent） ──
  markStage("synthesis:core-analysis");
  const coreParams: CoreAnalysisParams = {
    iterationName: normalized.name,
    baselineIterationName: previous?.name ?? "无基线",
    analyzedTarget,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text,
    fileStats: excerptPayload.fileStats,
    versionDiff: { added, changed, removed },
    diffLocations,
    requirements: reportBoundaryRequirements,
    components: resolvedBoundary?.componentRefs ?? [],
    codePaths: resolvedBoundary?.codePaths ?? [],
    visionPayloads
  };
  const coreResult = await runCoreAnalysisAgent(agentRunner, coreParams, CHUNK_CONFIG);

  // ── Business Confirmation Agent ──
  markStage("synthesis:biz-confirm");
  const bizParams: BizConfirmParams = {
    iterationName: normalized.name,
    baselineIterationName: previous?.name ?? "无基线",
    analyzedTarget,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text,
    requirements: reportBoundaryRequirements,
    components: resolvedBoundary?.componentRefs ?? [],
    codePaths: resolvedBoundary?.codePaths ?? [],
    clarificationQuestions: [...clarificationQuestions, ...coreResult.clarificationQuestions],
    versionDiff: { added, changed, removed },
    diffLocations,
    prioritizedFindings: coreResult.prioritizedFindings,
    projectDetection: coreResult.projectDetection,
    visionPayloads
  };
  const bizResult = await runBizConfirmAgent(agentRunner, bizParams, CHUNK_CONFIG);

  // UX 叠加（整合模式下 uxArtifacts 通常为空，但保留接口兼容）
  const businessConfirmationWithUx = {
    ...bizResult,
    interactionInsights: {
      ...bizResult.interactionInsights,
      primaryFlow: Array.from(new Set([...bizResult.interactionInsights.primaryFlow, ...uxArtifacts.interactionFlows])).slice(0, 12),
      keyInteractions: Array.from(new Set([...bizResult.interactionInsights.keyInteractions, ...uxArtifacts.uxConstraints])).slice(0, 14),
      exceptionPaths: Array.from(new Set([...bizResult.interactionInsights.exceptionPaths, ...uxArtifacts.uiStates])).slice(0, 12)
    }
  };

  const resolvedProjectDetection = {
    ...coreResult.projectDetection,
    evidence: Array.from(new Set(coreResult.projectDetection.evidence)).slice(0, 5)
  };
  const finalNextActions = Array.from(new Set(
    [...coreResult.nextActions, ...releaseOpsActions].map((i) => i.trim()).filter(Boolean)
  )).slice(0, 12);

  return {
    attachmentInsights: coreResult.attachmentInsights,
    resolvedProjectDetection,
    resolvedMeaningfulFindings: coreResult.meaningfulFindings,
    resolvedPrioritizedFindings: coreResult.prioritizedFindings,
    finalNextActions,
    businessConfirmationWithUx,
    governanceInsights: {
      traceabilityMap: coreResult.traceabilityMap,
      executableConstraints: coreResult.executableConstraints,
      domainKnowledge: coreResult.domainKnowledge,
      versionDiffDetailed: coreResult.versionDiffDetailed
    },
    deepInsights: coreResult.deepInsights,
    synthesisOutputs: [] as IterationAgentOutput[]
  };
}

// ── Consolidated Phase 4: Quality Audit ──

export async function consolidatedQualityPhase(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput,
  normalized: NormalizedIteration,
  pre: Awaited<ReturnType<typeof consolidatedPreflightPhase>>,
  exec: Awaited<ReturnType<typeof consolidatedAgentPhase>>,
  syn: Awaited<ReturnType<typeof consolidatedSynthesisPhase>>,
  clarificationQuestions: string[],
  platformContext: ReleaseReviewPlatformContext,
  markStage: (s: string) => void
) {
  const { excerptPayload } = pre;
  const { unknownSignalCount } = exec;
  const { resolvedPrioritizedFindings, finalNextActions, businessConfirmationWithUx, deepInsights } = syn;
  const { traceabilityMap, domainKnowledge, versionDiffDetailed, executableConstraints } = syn.governanceInsights;
  const analyzedTarget = input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName;

  markStage("synthesis:quality-audit");

  const qualityAuditResult = await runQualityAuditAgent(agentRunner, {
    iterationName: normalized.name,
    analyzedTarget,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text,
    deepInsights,
    prioritizedFindings: resolvedPrioritizedFindings,
    traceabilityMap,
    businessConfirmation: businessConfirmationWithUx,
    clarificationQuestions,
    qualitySignals: {
      testCaseCount: exec.finalAgentPlan.prompts.length,
      p0FindingCount: resolvedPrioritizedFindings.filter((i) => i.priority === "P0").length,
      unknownSignalCount,
      boundaryCoverage: traceabilityMap.coverageScore
    },
    blockers: resolvedPrioritizedFindings.filter((i) => i.priority === "P0").map((i) => i.content),
    releaseGates: traceabilityMap.unmappedRequirements.slice(0, 8),
    rollbackPlan: versionDiffDetailed.riskPoints.slice(0, 5),
    recommendations: finalNextActions.slice(0, 8),
    platformContext
  });

  const { quality: reportQuality, release } = qualityAuditResult;

  const releaseReview = {
    decision: release.decision,
    reason: release.reason,
    blockers: release.blockers,
    releaseGates: release.releaseGates,
    recommendations: release.recommendations,
    perPlatform: release.perPlatform ?? [],
    rollback: release.rollback,
    qualitySignals: release.qualitySignals
  };

  // score 从 parseReleaseReviewCandidate 中提取（包含在 release 对象中）
  const releaseReviewScore = (release as unknown as { score?: number }).score
    ?? (release.decision === "go" ? 85 : release.decision === "caution" ? 60 : 30);

  const opsRollbackLabel = releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚";
  const opsRollbackReasonText = releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : "";
  const opsTriage = {
    hypotheses: [] as Array<{ priority: string; item: string; evidence: string }>,
    triageSteps: [] as Array<{ step: string; expectedSignal: string; fallback: string }>,
    rollbackSuggestion: `回滚建议：${opsRollbackLabel}${opsRollbackReasonText}`
  };

  return {
    reportQuality,
    releaseReview,
    releaseReviewScore,
    opsTriage,
    traceabilityMap,
    domainKnowledge,
    versionDiffDetailed,
    executableConstraints
  };
}
