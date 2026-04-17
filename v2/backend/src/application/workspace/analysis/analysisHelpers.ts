import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type { IterationStatus, IterationTransitionSource } from '../../../domain/workspace/types';
import { extractKnowledgeBaseUpdateOp } from '../project/ontologyService';
import { createLogger as createOntologyLogger, createLogger } from '../../../infrastructure/runtime/logger';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import type { extractUxArtifacts } from './extractors';
import { isLowSignalText } from './extractors';
import { commitIterationArtifactOp, confirmIterationArtifactOp } from '../changeControl/artifactOps';
import { isSubstantiveContent } from '../changeControl/artifactDraftSynthesizer';
import { synthesizeArtifactDraftsViaLlm } from './artifactSynthesisAgentOps';

const log = createLogger("analysis-helpers");

// ── Lifecycle transition helper ──

export function applyLifecycleTransitionOp(
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

// ── Analysis data sufficiency check ──

type ChangeControlLike = {
  lastBusinessConfirmation?: {
    coreIntent?: string;
    functionalPoints?: string[];
  };
  lastPrioritizedFindings?: Array<{ priority: string; content: string }>;
  lastMeaningfulFindings?: string[];
};

export function isAnalysisDataSufficient(cc: ChangeControlLike): { sufficient: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const biz = cc.lastBusinessConfirmation;
  if (!biz?.coreIntent?.trim() || isLowSignalText(biz.coreIntent)) {
    reasons.push("coreIntent missing or low-signal");
  }
  if (!Array.isArray(biz?.functionalPoints) || biz.functionalPoints.length === 0) {
    reasons.push("functionalPoints empty");
  }
  if (!Array.isArray(cc.lastPrioritizedFindings) || cc.lastPrioritizedFindings.length === 0) {
    reasons.push("prioritizedFindings empty");
  }
  if (!Array.isArray(cc.lastMeaningfulFindings) || cc.lastMeaningfulFindings.length === 0 || cc.lastMeaningfulFindings.every(isLowSignalText)) {
    reasons.push("meaningfulFindings empty or low-signal");
  }
  return { sufficient: reasons.length === 0, reasons };
}

// ── Phase 5 helpers: boundary enrichment & data shaping ──

export function enrichBoundaryFromGovernance(
  prevBoundary: ReturnType<typeof defaultIterationChangeControl>["boundary"],
  businessConfirmation: { functionalPoints?: string[]; necessityAssessment?: { mustDo?: string[] } },
  traceabilityMap: { requirementToComponent?: Array<{ requirement?: string; components?: string[] }> },
  execConstraintsWhitelist: { componentWhitelist: string[]; codePathWhitelist: string[] },
  generatedAt: string
) {
  const enriched = { ...prevBoundary };
  if (prevBoundary.requirementRefs.length === 0) {
    const fromBiz = [
      ...(businessConfirmation.functionalPoints || []),
      ...(businessConfirmation.necessityAssessment?.mustDo || [])
    ].filter(Boolean);
    const fromTrace = (traceabilityMap.requirementToComponent || [])
      .map((r) => String(r?.requirement || "")).filter(Boolean);
    enriched.requirementRefs = Array.from(new Set([...fromBiz, ...fromTrace])).slice(0, 20);
  }
  if (prevBoundary.componentRefs.length === 0) {
    const fromTrace = Array.from(new Set(
      (traceabilityMap.requirementToComponent || [])
        .flatMap((r) => r?.components || [])
    )).filter(Boolean);
    enriched.componentRefs = Array.from(new Set([
      ...fromTrace, ...execConstraintsWhitelist.componentWhitelist
    ])).slice(0, 20);
  }
  if (prevBoundary.codePaths.length === 0) {
    enriched.codePaths = execConstraintsWhitelist.codePathWhitelist.slice(0, 20);
  }
  const wasEnriched =
    enriched.requirementRefs.length > prevBoundary.requirementRefs.length ||
    enriched.componentRefs.length > prevBoundary.componentRefs.length ||
    enriched.codePaths.length > prevBoundary.codePaths.length;
  if (wasEnriched) {
    enriched.note = enriched.note || "由分析管道从治理分析结果自动填充，待人工确认。";
    enriched.updatedAt = generatedAt;
  }
  return enriched;
}

function buildLastBusinessConfirmation(biz: {
  coreIntent?: string; boundarySummary?: string; functionalPoints?: string[];
  successCriteria?: string[]; confirmationChecklist?: unknown[]; versionDiffSummary?: string;
  necessityAssessment?: { mustDo?: string[]; shouldDo?: string[]; canDefer?: string[]; outOfScope?: string[]; rationale?: string };
  interactionInsights?: { primaryFlow?: string[]; keyInteractions?: string[]; exceptionPaths?: string[]; usabilityRisks?: string[] };
  diffNarratives?: string[];
}) {
  return {
    coreIntent: (biz.coreIntent || "").slice(0, 2000),
    boundarySummary: (biz.boundarySummary || "").slice(0, 2000),
    functionalPoints: (biz.functionalPoints || []).slice(0, 20),
    successCriteria: (biz.successCriteria || []).slice(0, 10),
    confirmationChecklist: (biz.confirmationChecklist || []).slice(0, 15).map((c: unknown) =>
      typeof c === "string" ? c : typeof c === "object" && c !== null && "item" in c ? String((c as Record<string, unknown>).item) : String(c)
    ),
    versionDiffSummary: (biz.versionDiffSummary || "").slice(0, 2000),
    necessityAssessment: {
      mustDo: (biz.necessityAssessment?.mustDo || []).slice(0, 12),
      shouldDo: (biz.necessityAssessment?.shouldDo || []).slice(0, 12),
      canDefer: (biz.necessityAssessment?.canDefer || []).slice(0, 12),
      outOfScope: (biz.necessityAssessment?.outOfScope || []).slice(0, 12),
      rationale: (biz.necessityAssessment?.rationale || "").slice(0, 2000),
    },
    interactionInsights: {
      primaryFlow: (biz.interactionInsights?.primaryFlow || []).slice(0, 12),
      keyInteractions: (biz.interactionInsights?.keyInteractions || []).slice(0, 14),
      exceptionPaths: (biz.interactionInsights?.exceptionPaths || []).slice(0, 12),
      usabilityRisks: (biz.interactionInsights?.usabilityRisks || []).slice(0, 12),
    },
    diffNarratives: (biz.diffNarratives || []).slice(0, 18),
  };
}

function buildDeepInsightsSummary(deepInsights: { crossFileInsights?: { themes?: string[]; gaps?: string[]; rootCauses?: string[]; decisionSuggestions?: string[] } } | null) {
  return {
    themes: (deepInsights?.crossFileInsights?.themes || []).slice(0, 10),
    gaps: (deepInsights?.crossFileInsights?.gaps || []).slice(0, 10),
    rootCauses: (deepInsights?.crossFileInsights?.rootCauses || []).slice(0, 8),
    decisionSuggestions: (deepInsights?.crossFileInsights?.decisionSuggestions || []).slice(0, 8)
  };
}

export async function synthesizeAndPersistDrafts(
  agentRunner: AgentRunner | null,
  repo: WorkspaceRepository,
  normalized: ReturnType<typeof normalizeIteration>,
  activeControl: ReturnType<typeof defaultIterationChangeControl>,
  generatedAt: string
) {
  const { updatedDrafts, clarifications: artifactClarifications } = await synthesizeArtifactDraftsViaLlm(
    agentRunner, normalized, activeControl
  );
  for (const { artifactId, content } of updatedDrafts) {
    const item = activeControl.artifactWorkflow.items.find((i) => i.id === artifactId);
    if (item && content) {
      item.draft.content = content;
      item.draft.updatedAt = generatedAt;
      item.draft.updatedBy = "llm-synthesis";
    }
  }
  if (artifactClarifications.length > 0) {
    activeControl.clarificationQuestions = Array.from(new Set([
      ...(activeControl.clarificationQuestions || []),
      ...artifactClarifications
    ]));
  }
  repo.updateIteration(normalized);
}

export function autoCommitClarificationArtifacts(
  repo: WorkspaceRepository,
  normalized: ReturnType<typeof normalizeIteration>,
  activeControl: ReturnType<typeof defaultIterationChangeControl>
) {
  const dataCheck = isAnalysisDataSufficient(activeControl);
  if (!dataCheck.sufficient) {
    log.warn("skipping auto-commit: analysis data insufficient", { reasons: dataCheck.reasons.join(", ") });
    return;
  }
  const autoCommitTargets = ["analysis-report"];
  for (const artifactId of autoCommitTargets) {
    const item = activeControl.artifactWorkflow.items.find((i) => i.id === artifactId);
    if (item && item.outputVersion === 0 && isSubstantiveContent(item.draft.content)) {
      commitIterationArtifactOp(repo, normalized.id, artifactId, {
        actor: "analysis-pipeline", summary: item.summary, source: "auto-analysis"
      });
      confirmIterationArtifactOp(repo, normalized.id, artifactId, {
        actor: "analysis-pipeline", passed: true, note: "分析管道自动确认"
      });
      const refreshed = repo.findIteration(normalized.id);
      if (refreshed) {
        normalized.changeControl = normalizeIteration(refreshed).changeControl;
      }
    }
  }
}

export function runOntologyExtraction(
  repo: WorkspaceRepository,
  normalized: ReturnType<typeof normalizeIteration>,
  projectId: number,
  traceabilityMap: { requirementToComponent: Array<{ requirement: string; components: string[] }>; componentToCode: Array<{ component: string }> },
  analysisReportPayload: Record<string, unknown> | null
) {
  const ontologyLog = createOntologyLogger("ontology-pipeline");
  try {
    const domainKnowledgeEntries = (normalized.changeControl?.domainKnowledgeEntries ?? []).map(e => ({
      term: e.term, definition: e.definition, mappedPages: e.mappedPages, mappedApis: e.mappedApis,
      mappedEntities: e.mappedEntities, mappedCodePaths: e.mappedCodePaths, evidence: e.evidence
    }));
    if (domainKnowledgeEntries.length === 0) return;
    const freshProject = repo.findProject(projectId);
    if (!freshProject) return;
    const existingKb = freshProject.knowledgeBase ?? {
      ontologyTerms: [], stableRules: [], componentInventory: [],
      codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
    };
    const resolvedBoundary = normalized.changeControl?.boundary ?? defaultIterationChangeControl().boundary;
    const ontologyInput = {
      domainKnowledgeEntries,
      traceabilityMap: traceabilityMap ? {
        pages: traceabilityMap.requirementToComponent.map(r => ({ name: r.requirement, path: r.requirement, components: r.components })),
        apis: traceabilityMap.componentToCode.map(c => ({ path: c.component, method: "GET", description: c.component })),
        entities: domainKnowledgeEntries.filter(e => e.mappedEntities.length > 0).map(e => ({ name: e.term, fields: e.mappedEntities }))
      } : null,
      boundary: resolvedBoundary ? { codePaths: resolvedBoundary.codePaths ?? [], requirementRefs: resolvedBoundary.requirementRefs ?? [] } : null,
      analysisReport: analysisReportPayload
    };
    const ontologyResult = extractKnowledgeBaseUpdateOp(existingKb, ontologyInput);
    freshProject.knowledgeBase = ontologyResult.updatedKb;
    repo.updateProject(freshProject);
    ontologyLog.info("ontology pipeline completed", { newTerms: ontologyResult.newTerms.length, updatedTerms: ontologyResult.updatedTerms.length, newRules: ontologyResult.newRules.length, newComponents: ontologyResult.newComponents.length });
    writeAuditLog(repo, "ontology.kb-updated", `project:${projectId}`, `terms=${ontologyResult.newTerms.length}+${ontologyResult.updatedTerms.length};rules=${ontologyResult.newRules.length};components=${ontologyResult.newComponents.length}`);
  } catch (ontologyError) {
    ontologyLog.error("ontology pipeline failed (non-blocking)", { error: ontologyError instanceof Error ? ontologyError.message : String(ontologyError) });
  }
}

export function buildAnalysisChangeControlState(
  currentChangeControl: ReturnType<typeof defaultIterationChangeControl>,
  syn: { resolvedPrioritizedFindings: Array<{ priority: string; content: string; reason: string }>; resolvedMeaningfulFindings: string[]; businessConfirmationWithUx: Parameters<typeof buildLastBusinessConfirmation>[0]; deepInsights: Parameters<typeof buildDeepInsightsSummary>[0] },
  qg: { reportQuality: { publishable: boolean; score: number; summary: string }; releaseReview: { decision: "" | "go" | "caution" | "block"; reason: string; blockers: string[]; rollback: { shouldRollback: boolean } }; releaseReviewScore: number; traceabilityMap: { coverageScore: number; mappingConfidence: "high" | "medium" | "low"; unmappedRequirements: string[]; conflicts: string[] }; domainKnowledge: { terms: Array<{ term: string; definition: string; mappedTo: { pages: string[]; apis: string[]; entities: string[]; codePaths: string[] }; evidence: string }> }; executableConstraints: { componentWhitelist: string[]; codePathWhitelist: string[]; acceptanceChecks: string[] } },
  metrics: { p0Count: number; highValueCount: number; consideredFiles: number; ignoredFiles: number; ignoredRatio: number },
  enrichedBoundary: ReturnType<typeof enrichBoundaryFromGovernance>,
  uxArtifacts: ReturnType<typeof extractUxArtifacts>,
  generatedAt: string
) {
  return {
    ...currentChangeControl,
    boundary: enrichedBoundary,
    lastAnalysisP0Count: metrics.p0Count,
    lastAnalysisHighValueCount: metrics.highValueCount,
    lastAnalysisConsideredFiles: metrics.consideredFiles,
    lastAnalysisIgnoredFiles: metrics.ignoredFiles,
    lastAnalysisIgnoredFileRatio: metrics.ignoredRatio,
    lastReleaseReviewDecision: qg.releaseReview.decision,
    lastReleaseReviewReason: qg.releaseReview.reason,
    lastReleaseReviewBlockers: qg.releaseReview.blockers,
    lastReleaseReviewScore: qg.releaseReviewScore,
    lastReleaseReviewUpdatedAt: generatedAt,
    lastTraceabilityCoverageScore: qg.traceabilityMap.coverageScore,
    lastOpsRollbackSuggested: qg.releaseReview.rollback.shouldRollback,
    lastReportPublishable: qg.reportQuality.publishable,
    lastReportQualityScore: qg.reportQuality.score,
    lastReportQualitySummary: qg.reportQuality.summary,
    lastReportQualityUpdatedAt: generatedAt,
    uxArtifacts: { ...uxArtifacts, updatedAt: generatedAt },
    executableConstraints: { ...qg.executableConstraints, generatedAt },
    traceabilitySnapshot: {
      requirementCoverage: qg.traceabilityMap.coverageScore,
      mappingConfidence: qg.traceabilityMap.mappingConfidence,
      unmappedRequirements: qg.traceabilityMap.unmappedRequirements,
      conflicts: qg.traceabilityMap.conflicts,
      generatedAt
    },
    domainKnowledgeEntries: qg.domainKnowledge.terms.map((item) => ({
      term: item.term, definition: item.definition,
      mappedPages: item.mappedTo.pages, mappedApis: item.mappedTo.apis,
      mappedEntities: item.mappedTo.entities, mappedCodePaths: item.mappedTo.codePaths,
      evidence: item.evidence
    })),
    domainKnowledgeUpdatedAt: generatedAt,
    lastBusinessConfirmation: buildLastBusinessConfirmation(syn.businessConfirmationWithUx),
    lastMeaningfulFindings: syn.resolvedMeaningfulFindings.slice(0, 15),
    lastPrioritizedFindings: syn.resolvedPrioritizedFindings.slice(0, 15).map((f) => ({ priority: f.priority, content: f.content, reason: f.reason })),
    lastDeepInsightsSummary: buildDeepInsightsSummary(syn.deepInsights)
  };
}
