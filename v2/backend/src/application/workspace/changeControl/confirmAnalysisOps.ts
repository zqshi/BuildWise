/**
 * confirmAnalysisOps — 确认分析变更控制辅助
 *
 * 从 coreOps 拆出的非导出辅助函数，服务于 confirmIterationAnalysisOp：
 * - 验收检查项合并
 * - 澄清请求处理 / 确认后变更控制构建
 * - 分析报告 artifact 更新 / 知识库持久化 / 就绪交付物消息发布
 * - 确认前置条件校验
 *
 * 纯编排辅助，不持有状态。
 */
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationChangeBoundary } from '../../../domain/workspace/types';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl, resolveClarificationSelection, writeAuditLog } from '../shared/common';
import { extractKnowledgeBaseUpdateOp, detectOntologyCollisionsOp } from '../project/ontologyService';
import { syncProjectWorkspaceKnowledge } from '../project/projectWorkspaceKnowledgeService';
import { ensureArtifactWorkflow, markDownstreamStale } from './artifactWorkflow';
import { publishArtifactReferenceMessage, publishChangeImpactMessage } from './conversationPolicy';

export function mergeAcceptanceChecks(...sources: Array<string[] | undefined>) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const rawItem of source) {
      const item = rawItem.trim();
      if (!item || seen.has(item)) {
        continue;
      }
      seen.add(item);
      merged.push(item);
    }
  }
  return merged;
}

export function handleClarificationRequest(
  repo: WorkspaceRepository,
  iterationId: number,
  normalized: ReturnType<typeof normalizeIteration>,
  current: ReturnType<typeof defaultIterationChangeControl>,
  resolution: ReturnType<typeof resolveClarificationSelection>,
  note: string,
  now: string
) {
  normalized.changeControl = {
    ...current,
    pendingHumanConfirmation: true,
    clarificationRounds: (current?.clarificationRounds || 0) + 1,
    clarificationQuestions: Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [],
    clarificationDraftResolvedQuestions: resolution.resolvedQuestions,
    clarificationDraftUpdatedAt: now,
    lastClarificationResolution: resolution,
    lastClarificationNote: note,
    confirmedAt: "",
    confirmedBy: "",
    artifactWorkflow: ensureArtifactWorkflow(normalized, { ...current, pendingHumanConfirmation: true }, now)
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_analysis_clarification_requested", `iteration:${iterationId}`, note || "用户要求继续澄清附件分析结果");
  return { ok: true as const, data: normalized.changeControl };
}

export function buildConfirmedChangeControl(
  normalized: ReturnType<typeof normalizeIteration>,
  current: ReturnType<typeof defaultIterationChangeControl>,
  input: { actor?: string; boundary?: Partial<IterationChangeBoundary> },
  effectiveResolution: ReturnType<typeof resolveClarificationSelection>,
  acceptanceChecks: string[],
  note: string,
  now: string
) {
  const boundary = input.boundary;
  return {
    ...current,
    pendingHumanConfirmation: false,
    clarificationQuestions: [],
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: now,
    lastClarificationResolution: effectiveResolution,
    lastClarificationNote: note,
    confirmedAt: now,
    confirmedBy: input.actor?.trim() || "human",
    boundary: {
      requirementRefs: Array.isArray(boundary?.requirementRefs) ? boundary.requirementRefs.map((item) => item.trim()).filter(Boolean) : current?.boundary.requirementRefs || [],
      componentRefs: Array.isArray(boundary?.componentRefs) ? boundary.componentRefs.map((item) => item.trim()).filter(Boolean) : current?.boundary.componentRefs || [],
      codePaths: Array.isArray(boundary?.codePaths) ? boundary.codePaths.map((item) => item.trim()).filter(Boolean) : current?.boundary.codePaths || [],
      note: boundary?.note?.trim() || current?.boundary.note || "",
      updatedAt: now
    },
    executableConstraints: {
      componentWhitelist: Array.isArray(boundary?.componentRefs) ? boundary.componentRefs.map((item) => item.trim()).filter(Boolean) : current?.executableConstraints?.componentWhitelist || [],
      codePathWhitelist: Array.isArray(boundary?.codePaths) ? boundary.codePaths.map((item) => item.trim()).filter(Boolean) : current?.executableConstraints?.codePathWhitelist || [],
      acceptanceChecks,
      generatedAt: now
    },
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
}

export function updateAnalysisReportArtifact(
  repo: WorkspaceRepository,
  iterationId: number,
  changeControl: ReturnType<typeof defaultIterationChangeControl>,
  now: string
) {
  const analysisItem = changeControl.artifactWorkflow.items.find((item) => item.id === "analysis-report");
  if (!analysisItem) return;
  analysisItem.gateStatus = "passed";
  analysisItem.lastConfirmedBy = changeControl.confirmedBy;
  analysisItem.lastConfirmedAt = now;
  analysisItem.outputVersion += 1;
  analysisItem.updatedAt = now;
  analysisItem.stale = false;
  const staleAfterAnalysis = markDownstreamStale(changeControl.artifactWorkflow.items, analysisItem.id);
  if (staleAfterAnalysis.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterAnalysis);
}

export function persistKnowledgeBaseUpdate(
  repo: WorkspaceRepository,
  normalized: ReturnType<typeof normalizeIteration>
) {
  const changeControl = normalized.changeControl;
  if (!changeControl) return;
  const domainEntries = changeControl.domainKnowledgeEntries;
  if (!Array.isArray(domainEntries) || domainEntries.length === 0) return;
  const project = repo.findProject(normalized.projectId);
  if (!project) return;
  const kb = project.knowledgeBase ?? {
    ontologyTerms: [], stableRules: [], componentInventory: [],
    codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
  };
  const collisions = detectOntologyCollisionsOp(kb, domainEntries);
  changeControl.knowledgeHits = collisions.knowledgeHits;
  changeControl.knowledgeConflicts = [
    ...collisions.knowledgeConflicts,
    ...collisions.termCollisions.map((tc) =>
      `术语碰撞：「${tc.newTerm}」(${tc.newDefinition}) 与已有规则「${tc.existingRule}」可能矛盾`
    )
  ];
  const boundary = changeControl.boundary;
  const riskAreas = (changeControl as Record<string, unknown>).knownRisks;
  const traceabilitySnapshot = changeControl.traceabilitySnapshot;
  const traceabilityMap = traceabilitySnapshot
    ? {
        pages: (boundary?.requirementRefs || []).map((req) => ({
          name: req, path: req, components: boundary?.componentRefs || []
        })),
        apis: domainEntries
          .filter((e) => e.mappedApis.length > 0)
          .map((e) => ({ path: e.mappedApis[0] || e.term, method: "GET", description: e.term })),
        entities: domainEntries
          .filter((e) => e.mappedEntities.length > 0)
          .map((e) => ({ name: e.term, fields: e.mappedEntities }))
      }
    : null;
  const ontologyResult = extractKnowledgeBaseUpdateOp(kb, {
    domainKnowledgeEntries: domainEntries,
    traceabilityMap,
    boundary: {
      codePaths: boundary?.codePaths || [],
      requirementRefs: boundary?.requirementRefs || [],
      riskAreas: Array.isArray(riskAreas) ? riskAreas as Array<{ risk: string; mitigation: string; trigger: string }> : undefined
    },
    analysisReport: null
  });
  repo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
  syncProjectWorkspaceKnowledge(repo, normalized.projectId);
  writeAuditLog(
    repo, "project_knowledge_base_updated", `project:${normalized.projectId}`,
    `terms=${ontologyResult.updatedKb.ontologyTerms.length};rules=${ontologyResult.updatedKb.stableRules.length};components=${ontologyResult.updatedKb.componentInventory.length};hits=${collisions.knowledgeHits.length};conflicts=${collisions.knowledgeConflicts.length}`
  );
}

export function publishReadyArtifactMessages(
  repo: WorkspaceRepository,
  iterationId: number,
  workflow: ReturnType<typeof ensureArtifactWorkflow> | undefined
) {
  if (!workflow) return;
  for (const artifact of workflow.items) {
    if (artifact.status === "ready" && artifact.gateStatus === "passed") {
      publishArtifactReferenceMessage(repo, iterationId, {
        title: artifact.title,
        summary: artifact.summary || artifact.description,
        evidence: artifact.evidence,
        draftContent: artifact.draft?.content || "",
        prompt: `请围绕交付物「${artifact.title}」继续与用户确认，不要直接跨阶段推进。`
      });
    }
  }
}

export function validateConfirmationPreconditions(
  current: ReturnType<typeof defaultIterationChangeControl>,
  resolution: ReturnType<typeof resolveClarificationSelection>,
  force?: boolean
): { ok: true; effectiveResolution: typeof resolution } | { ok: false; reason: string; [key: string]: unknown } {
  if (current.lastReportPublishable === false && current.lastAnalysisAt && !force) {
    return {
      ok: false as const,
      reason: "report_not_publishable",
      quality: { score: current.lastReportQualityScore, summary: current.lastReportQualitySummary }
    };
  }
  if (resolution.unresolvedQuestions.length > 0 && !force) {
    return {
      ok: false as const,
      reason: "clarification_questions_unresolved",
      unresolvedQuestions: resolution.unresolvedQuestions
    };
  }
  // force=true 时将所有未解决问题视为已解决，避免写入不一致的 resolution
  const effectiveResolution = force && resolution.unresolvedQuestions.length > 0
    ? {
        resolvedQuestions: [...resolution.resolvedQuestions, ...resolution.unresolvedQuestions],
        unresolvedQuestions: [] as string[],
        updatedAt: resolution.updatedAt
      }
    : resolution;
  return { ok: true as const, effectiveResolution };
}
