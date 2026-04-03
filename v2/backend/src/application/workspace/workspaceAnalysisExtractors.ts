import type { AttachmentAnalysisReport, IterationAgentOutput } from "../../domain/workspace/types";
export { pickString, pickStringList } from "../../shared/utils";
import { pickString, pickStringList } from "../../shared/utils";
import { safeJsonParse } from "./attachmentOps";

/**
 * @deprecated Use safeJsonParse from attachmentOps instead.
 * Kept as a re-export for backward compatibility with existing consumers.
 */
export const parseJsonObjectFromText = safeJsonParse;

export const normalizeConfidence = (value: string): "high" | "medium" | "low" =>
  value === "high" || value === "medium" || value === "low" ? value : "medium";

export function isLowSignalText(value: string) {
  const normalized = (value || "").trim();
  if (!normalized) return true;
  if (normalized.length < 8) return true;
  return /暂无|无明显|待补充|可继续确认|按需补充|请结合业务验收|后续确认/.test(normalized);
}

function listParsedRoleOutputs(agentOutputs: IterationAgentOutput[], role: IterationAgentOutput["role"]) {
  return agentOutputs
    .filter((item) => item.role === role && item.status === "success")
    .map((item) => parseJsonObjectFromText(item.content))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function extractGeneratedTestMatrix(agentOutputs: IterationAgentOutput[]) {
  for (const output of agentOutputs) {
    if (output.role !== "qa-reviewer" || output.status !== "success") {
      continue;
    }
    const parsed = parseJsonObjectFromText(output.content);
    const matrix = parsed?.testMatrix;
    if (!Array.isArray(matrix)) {
      continue;
    }
    const normalized = matrix
      .map((item, index) => {
        const row = item as Record<string, unknown>;
        const type = typeof row.type === "string" ? row.type.trim() : "";
        const caseId = typeof row.caseId === "string" ? row.caseId.trim() : `auto-case-${index + 1}`;
        const focus = typeof row.focus === "string" ? row.focus.trim() : "";
        const expected = typeof row.expected === "string" ? row.expected.trim() : "";
        const evidence = typeof row.evidence === "string" ? row.evidence.trim() : "";
        return {
          type,
          caseId,
          focus,
          expected,
          evidence,
          executionStatus: "pending" as const,
          executionUpdatedAt: "",
          executionBy: "",
          executionNote: ""
        };
      })
      .filter((item) => item.type || item.caseId || item.focus || item.expected || item.evidence)
      .slice(0, 50);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return [];
}

export function extractBoundarySuggestion(agentOutputs: IterationAgentOutput[]) {
  for (const output of agentOutputs) {
    if (output.role !== "boundary-guardian" || output.status !== "success") {
      continue;
    }
    const parsed = parseJsonObjectFromText(output.content);
    const boundaryRaw = (parsed?.boundary ?? {}) as Record<string, unknown>;
    const requirementRefs = pickStringList(boundaryRaw.requirementRefs, 12);
    const componentRefs = pickStringList(boundaryRaw.componentRefs, 12);
    const codePaths = pickStringList(boundaryRaw.codePaths, 12);
    const note = pickString(boundaryRaw.note);
    const hasAny = requirementRefs.length > 0 || componentRefs.length > 0 || codePaths.length > 0 || note.length > 0;
    if (hasAny) {
      return { requirementRefs, componentRefs, codePaths, note };
    }
  }
  return null;
}

export function extractReleaseOpsActions(agentOutputs: IterationAgentOutput[]) {
  for (const output of agentOutputs) {
    if (output.role !== "release-ops-advisor" || output.status !== "success") {
      continue;
    }
    const parsed = parseJsonObjectFromText(output.content);
    const hypotheses = Array.isArray(parsed?.hypotheses) ? (parsed?.hypotheses as Array<Record<string, unknown>>) : [];
    const triageSteps = Array.isArray(parsed?.triageSteps) ? (parsed?.triageSteps as Array<Record<string, unknown>>) : [];
    const rollbackDecision = (parsed?.rollbackDecision ?? {}) as Record<string, unknown>;
    const actions: string[] = [];
    for (const item of hypotheses.slice(0, 3)) {
      const priority = pickString(item.priority) || "P1";
      const content = pickString(item.item);
      if (content) {
        actions.push(`运维假设(${priority})：${content}`);
      }
    }
    for (const step of triageSteps.slice(0, 3)) {
      const detail = pickString(step.step);
      if (detail) {
        actions.push(`排障步骤：${detail}`);
      }
    }
    const shouldRollback = Boolean(rollbackDecision.shouldRollback);
    const reason = pickString(rollbackDecision.reason);
    if (shouldRollback || reason) {
      actions.push(`回滚建议：${shouldRollback ? "建议回滚" : "暂不回滚"}${reason ? `（${reason}）` : ""}`);
    }
    if (actions.length > 0) {
      return actions.slice(0, 6);
    }
  }
  return [];
}

export function extractReleaseOpsStructured(agentOutputs: IterationAgentOutput[]) {
  const parsed = listParsedRoleOutputs(agentOutputs, "release-ops-advisor")[0] ?? null;
  const hypotheses = Array.isArray(parsed?.hypotheses) ? (parsed?.hypotheses as Array<Record<string, unknown>>) : [];
  const triageSteps = Array.isArray(parsed?.triageSteps) ? (parsed?.triageSteps as Array<Record<string, unknown>>) : [];
  const rollbackDecision = (parsed?.rollbackDecision ?? {}) as Record<string, unknown>;
  return {
    hypotheses: hypotheses
      .slice(0, 5)
      .map((item) => ({
        priority: pickString(item.priority) || "P1",
        item: pickString(item.item),
        evidence: pickString(item.evidence)
      }))
      .filter((item) => item.item),
    triageSteps: triageSteps
      .slice(0, 6)
      .map((item) => ({
        step: pickString(item.step),
        expectedSignal: pickString(item.expectedSignal),
        fallback: pickString(item.fallback)
      }))
      .filter((item) => item.step),
    rollbackDecision: {
      shouldRollback: Boolean(rollbackDecision.shouldRollback),
      reason: pickString(rollbackDecision.reason),
      trigger: pickString(rollbackDecision.trigger)
    }
  };
}

export function extractReleaseReview(agentOutputs: IterationAgentOutput[]) {
  const qaParsed = listParsedRoleOutputs(agentOutputs, "qa-reviewer")[0] ?? null;
  const deliveryParsed =
    listParsedRoleOutputs(agentOutputs, "delivery-engineer")[0] ??
    listParsedRoleOutputs(agentOutputs, "solution-architect")[0] ??
    null;
  const qaDecision = (qaParsed?.releaseDecision ?? {}) as Record<string, unknown>;
  const qaBlockers = pickStringList(qaDecision.blockers, 8);
  const qaPass = Boolean(qaDecision.pass);
  const releaseReason = pickString(qaDecision.reason);
  const releaseGates = pickStringList(deliveryParsed?.releaseGates, 8);
  const rollbackPlan = Array.isArray(deliveryParsed?.rollbackPlan)
    ? (deliveryParsed?.rollbackPlan as Array<Record<string, unknown>>)
        .slice(0, 5)
        .map((item) => {
          const trigger = pickString(item.trigger);
          const action = pickString(item.action);
          return [trigger, action].filter(Boolean).join(" -> ");
        })
        .filter(Boolean)
    : [];
  return {
    qaPass,
    releaseReason,
    blockers: qaBlockers,
    releaseGates,
    rollbackPlan
  };
}

export function extractGeneratedQualityArtifacts(agentOutputs: IterationAgentOutput[]) {
  const qaParsed = listParsedRoleOutputs(agentOutputs, "qa-reviewer")[0] ?? null;
  const pickList = (value: unknown, max = 20) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, max)
      : [];
  const unitTests = pickList(qaParsed?.unitTests, 20);
  const contractTests = pickList(qaParsed?.contractTests, 20);
  const acceptanceChecklist = pickList(qaParsed?.acceptanceChecklist, 20);
  const regressionPoints = pickList(qaParsed?.regressionsToWatch, 20);
  return { unitTests, contractTests, acceptanceChecklist, regressionPoints, materializedFiles: [] as string[] };
}

export function extractUxArtifacts(agentOutputs: IterationAgentOutput[]) {
  const uxParsed = listParsedRoleOutputs(agentOutputs, "ux-designer")[0] ?? null;
  return {
    informationArchitecture: pickStringList(uxParsed?.informationArchitecture, 12),
    interactionFlows: pickStringList(uxParsed?.interactionFlows, 12),
    uiStates: pickStringList(uxParsed?.uiStates, 12),
    uxConstraints: pickStringList(uxParsed?.uxConstraints, 16)
  };
}

export function collectLlmBackedReportPayloadIssues(params: {
  projectDetection: AttachmentAnalysisReport["projectDetection"];
  meaningfulFindings: string[];
  prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
  nextActions: string[];
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"];
  reportQuality: AttachmentAnalysisReport["reportQuality"];
  outputList: IterationAgentOutput[];
}) {
  const reasons: string[] = [];
  if (!params.projectDetection.projectName && !params.projectDetection.productName) {
    reasons.push("missing project/product");
  }
  if (params.meaningfulFindings.length === 0 || params.meaningfulFindings.every(isLowSignalText)) {
    reasons.push("meaningfulFindings low-signal");
  }
  if (params.prioritizedFindings.length === 0) {
    reasons.push("prioritizedFindings empty");
  }
  if (params.nextActions.length === 0 || params.nextActions.every(isLowSignalText)) {
    reasons.push("nextActions low-signal");
  }
  if (!params.businessConfirmation.coreIntent || isLowSignalText(params.businessConfirmation.coreIntent)) {
    reasons.push("coreIntent low-signal");
  }
  if (!params.businessConfirmation.versionDiffSummary || isLowSignalText(params.businessConfirmation.versionDiffSummary)) {
    reasons.push("versionDiffSummary low-signal");
  }
  if (!params.reportQuality.summary || isLowSignalText(params.reportQuality.summary)) {
    reasons.push("reportQuality.summary low-signal");
  }
  if (params.outputList.length === 0) {
    reasons.push("agentOutputs empty");
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Attachment Insights (merged from workspaceServiceAnalysisAttachmentInsightsOps)
// ---------------------------------------------------------------------------

export function parseAttachmentInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  return {
    projectCategory: pickString(parsed?.projectCategory),
    artifactType: pickString(parsed?.artifactType),
    keyCharacteristics: pickStringList(parsed?.keyCharacteristics, 12),
    versionChangeSummary: pickString(parsed?.versionChangeSummary),
    confidence: normalizeConfidence(pickString(parsed?.confidence)),
    limitations: pickStringList(parsed?.limitations, 12)
  };
}

export function listAttachmentInsightsMissingReasons(candidate: ReturnType<typeof parseAttachmentInsightsCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectCategory) reasons.push("missing projectCategory");
  if (!candidate.artifactType) reasons.push("missing artifactType");
  if (candidate.keyCharacteristics.length === 0) reasons.push("keyCharacteristics is empty");
  if (!candidate.versionChangeSummary) reasons.push("missing versionChangeSummary");
  return reasons;
}

// ---------------------------------------------------------------------------
// Business Confirmation (merged from workspaceServiceAnalysisBusinessConfirmationOps)
// ---------------------------------------------------------------------------

const normalizeImpactLevel = (value: string): "高" | "中" | "低" => (value === "高" || value === "中" || value === "低" ? value : "中");

const normalizeChecklist = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => item as Record<string, unknown>)
        .map((item, index) => ({
          order: Number.isFinite(Number(item.order)) ? Math.max(1, Math.floor(Number(item.order))) : index + 1,
          impactLevel: normalizeImpactLevel(pickString(item.impactLevel)),
          item: pickString(item.item),
          rationale: pickString(item.rationale)
        }))
        .filter((item) => item.item.length > 0)
        .slice(0, 12)
    : [];

export function parseBusinessConfirmationCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) ?? {};
  return {
    coreIntent: pickString((parsed as Record<string, unknown>).coreIntent),
    successCriteria: pickStringList((parsed as Record<string, unknown>).successCriteria, 12),
    interactionInsights: {
      primaryFlow: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.primaryFlow, 10),
      keyInteractions: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.keyInteractions, 12),
      exceptionPaths: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.exceptionPaths, 10),
      usabilityRisks: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.usabilityRisks, 10)
    },
    necessityAssessment: {
      mustDo: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.mustDo, 10),
      shouldDo: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.shouldDo, 10),
      canDefer: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.canDefer, 10),
      outOfScope: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.outOfScope, 10),
      rationale: pickString(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.rationale)
    },
    evidenceRefs: pickStringList((parsed as Record<string, unknown>).evidenceRefs, 16),
    boundarySummary: pickString((parsed as Record<string, unknown>).boundarySummary),
    functionalPoints: pickStringList((parsed as Record<string, unknown>).functionalPoints, 16),
    confirmationChecklist: normalizeChecklist((parsed as Record<string, unknown>).confirmationChecklist),
    versionDiffSummary: pickString((parsed as Record<string, unknown>).versionDiffSummary),
    diffNarratives: pickStringList((parsed as Record<string, unknown>).diffNarratives, 16),
    diffConfirmationOrder: normalizeChecklist((parsed as Record<string, unknown>).diffConfirmationOrder)
  };
}

export function listBusinessConfirmationMissingReasons(candidate: ReturnType<typeof parseBusinessConfirmationCandidate>) {
  const reasons: string[] = [];
  if (!candidate.coreIntent) reasons.push("missing coreIntent");
  if (candidate.successCriteria.length === 0) reasons.push("successCriteria is empty");
  if (candidate.interactionInsights.primaryFlow.length === 0) reasons.push("interactionInsights.primaryFlow is empty");
  if (candidate.interactionInsights.keyInteractions.length === 0) reasons.push("interactionInsights.keyInteractions is empty");
  if (candidate.necessityAssessment.mustDo.length === 0 && candidate.necessityAssessment.shouldDo.length === 0 && candidate.necessityAssessment.canDefer.length === 0) {
    reasons.push("necessityAssessment has no actionable items");
  }
  if (!candidate.necessityAssessment.rationale) reasons.push("missing necessityAssessment.rationale");
  if (candidate.evidenceRefs.length === 0) reasons.push("evidenceRefs is empty");
  if (!candidate.boundarySummary) reasons.push("missing boundarySummary");
  if (candidate.functionalPoints.length === 0) reasons.push("functionalPoints is empty");
  if (candidate.confirmationChecklist.length === 0) reasons.push("confirmationChecklist is empty");
  if (!candidate.versionDiffSummary) reasons.push("missing versionDiffSummary");
  if (candidate.diffNarratives.length === 0) reasons.push("diffNarratives is empty");
  if (candidate.diffConfirmationOrder.length === 0) reasons.push("diffConfirmationOrder is empty");
  return reasons;
}

// ---------------------------------------------------------------------------
// Deep Insights (merged from workspaceServiceAnalysisDeepInsightsOps)
// ---------------------------------------------------------------------------

const normalizeKind = (value: string): "document" | "code" | "image" | "prototype" | "binary" =>
  value === "document" || value === "code" || value === "image" || value === "prototype" || value === "binary" ? value : "document";
const normalizeStatus = (value: string): "analyzed" | "partial" | "failed" =>
  value === "analyzed" || value === "partial" || value === "failed" ? value : "partial";

export function parseDeepInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const coverageRaw = (parsed?.coverage ?? {}) as Record<string, unknown>;
  const fileInsightsRaw = Array.isArray(parsed?.fileInsights) ? (parsed?.fileInsights as Array<Record<string, unknown>>) : [];
  const fileInsights = fileInsightsRaw
    .map((item) => ({
      path: pickString(item.path),
      fileName: pickString(item.fileName),
      mimeType: pickString(item.mimeType) || "application/octet-stream",
      size: Number.isFinite(Number(item.size)) ? Math.max(0, Math.floor(Number(item.size))) : 0,
      kind: normalizeKind(pickString(item.kind)),
      status: normalizeStatus(pickString(item.status)),
      mainContent: pickString(item.mainContent),
      requiredWork: pickString(item.requiredWork),
      iterationValue: pickString(item.iterationValue),
      summary: pickString(item.summary),
      keyPoints: pickStringList(item.keyPoints, 8),
      risks: pickStringList(item.risks, 6),
      optimizeItems: pickStringList(item.optimizeItems, 8),
      keepItems: pickStringList(item.keepItems, 8),
      recommendedActions: pickStringList(item.recommendedActions, 8),
      openQuestions: pickStringList(item.openQuestions, 6),
      citations: pickStringList(item.citations, 6),
      confidence: normalizeConfidence(pickString(item.confidence))
    }))
    .filter((item) => item.path.length > 0 || item.fileName.length > 0)
    .slice(0, 300);
  const consideredFiles = Number.isFinite(Number(coverageRaw.consideredFiles)) ? Math.max(0, Math.floor(Number(coverageRaw.consideredFiles))) : fileInsights.length;
  const analyzedFiles = fileInsights.filter((item) => item.status === "analyzed").length;
  const partialFiles = fileInsights.filter((item) => item.status === "partial").length;
  const failedFiles = fileInsights.filter((item) => item.status === "failed").length;
  const coveragePercent = consideredFiles === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((analyzedFiles + partialFiles) / consideredFiles) * 100)));
  const crossRaw = (parsed?.crossFileInsights ?? {}) as Record<string, unknown>;
  return {
    coverage: {
      consideredFiles,
      analyzedFiles,
      partialFiles,
      failedFiles,
      coveragePercent
    },
    fileInsights,
    crossFileInsights: {
      themes: pickStringList(crossRaw.themes, 16),
      conflicts: pickStringList(crossRaw.conflicts, 16),
      gaps: pickStringList(crossRaw.gaps, 16),
      recommendations: pickStringList(crossRaw.recommendations, 16),
      conflictChains: pickStringList(crossRaw.conflictChains, 16),
      rootCauses: pickStringList(crossRaw.rootCauses, 16),
      impactScope: pickStringList(crossRaw.impactScope, 16),
      decisionSuggestions: pickStringList(crossRaw.decisionSuggestions, 16)
    }
  };
}

export function listDeepInsightsMissingReasons(candidate: ReturnType<typeof parseDeepInsightsCandidate>) {
  const reasons: string[] = [];
  if (candidate.fileInsights.length === 0) reasons.push("fileInsights is empty");
  if (
    candidate.fileInsights.some(
      (item) =>
        item.status === "analyzed" &&
        (!item.mainContent || !item.requiredWork || !item.iterationValue || item.recommendedActions.length === 0)
    )
  ) {
    reasons.push("fileInsights missing mainContent/requiredWork/iterationValue/recommendedActions");
  }
  if (candidate.crossFileInsights.themes.length === 0 && candidate.crossFileInsights.gaps.length === 0) {
    reasons.push("crossFileInsights missing themes/gaps");
  }
  if (candidate.crossFileInsights.rootCauses.length === 0) {
    reasons.push("crossFileInsights missing rootCauses");
  }
  if (candidate.crossFileInsights.decisionSuggestions.length === 0) {
    reasons.push("crossFileInsights missing decisionSuggestions");
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Preflight: Execution Policy & Folder Selection (merged from workspaceServiceAnalysisPreflightOps)
// ---------------------------------------------------------------------------

export function parseExecutionPolicyCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const riskRaw = pickString(parsed?.promptBudgetRisk).toLowerCase();
  const promptBudgetRisk: "low" | "medium" | "high" =
    riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : "medium";
  return {
    degraded: Boolean(parsed?.degraded),
    reason: pickString(parsed?.reason),
    enforceSingleAgent: Boolean(parsed?.enforceSingleAgent),
    forceMultiAgent: Boolean(parsed?.forceMultiAgent),
    promptBudgetRisk
  };
}

export function resolveExecutionPolicyHeuristically(input: {
  sourceType: "single-file" | "folder";
  excerptLength: number;
  chunkCount: number;
  totalFiles: number;
  binaryFiles: number;
  forceMultiAgentHint?: boolean;
}) {
  if (input.forceMultiAgentHint) {
    return null;
  }
  if (
    input.sourceType === "single-file" &&
    input.totalFiles <= 1 &&
    input.binaryFiles === 0 &&
    input.excerptLength > 0 &&
    input.excerptLength <= 12000 &&
    input.chunkCount <= 1
  ) {
    return {
      degraded: false,
      reason: "heuristic-simple-single-file",
      enforceSingleAgent: true,
      forceMultiAgent: false,
      promptBudgetRisk: input.excerptLength > 8000 ? "medium" : "low"
    } as const;
  }
  return null;
}

export function listExecutionPolicyMissingReasons(candidate: ReturnType<typeof parseExecutionPolicyCandidate>) {
  const reasons: string[] = [];
  if (!candidate.reason) reasons.push("missing reason");
  if (candidate.enforceSingleAgent && candidate.forceMultiAgent) reasons.push("conflict enforceSingleAgent and forceMultiAgent");
  return reasons;
}

export function parseFolderSelectionCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const includedPaths = pickStringList(parsed?.includedPaths, 800);
  const ignoredFiles = Array.isArray(parsed?.ignoredFiles)
    ? (parsed?.ignoredFiles as Array<Record<string, unknown>>)
        .map((item) => ({
          path: pickString(item.path),
          reason: pickString(item.reason)
        }))
        .filter((item) => item.path.length > 0)
        .slice(0, 400)
    : [];
  const sampleReason = pickString(parsed?.sampleReason);
  return { includedPaths, ignoredFiles, sampleReason };
}

export function listFolderSelectionMissingReasons(candidate: ReturnType<typeof parseFolderSelectionCandidate>) {
  const reasons: string[] = [];
  if (candidate.includedPaths.length === 0) reasons.push("includedPaths is empty");
  return reasons;
}

// ---------------------------------------------------------------------------
// Project Profile (merged from workspaceServiceAnalysisProjectProfileOps)
// ---------------------------------------------------------------------------

// LLM（尤其 DeepSeek）可能输出中文 key，建立中->英映射作为 fallback
function resolveKey(parsed: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!parsed) return undefined;
  for (const key of keys) {
    if (parsed[key] !== undefined) return parsed[key];
  }
  return undefined;
}

function resolveProjectDetection(parsed: Record<string, unknown> | null): Record<string, unknown> {
  if (!parsed) return {};
  // 先尝试英文 key
  if (parsed.projectDetection && typeof parsed.projectDetection === "object") {
    return parsed.projectDetection as Record<string, unknown>;
  }
  // fallback: 从中文 key 构造
  const projectName = resolveKey(parsed, "projectName", "项目名称") as string | undefined;
  const productName = resolveKey(parsed, "productName", "产品名称") as string | undefined;
  const projectCategory = resolveKey(parsed, "projectCategory", "项目类别", "项目类型") as string | undefined;
  const evidence = resolveKey(parsed, "evidence", "依据", "证据") as unknown[] | undefined;
  if (projectName || productName) {
    return { projectName, productName, projectCategory, evidence };
  }
  return {};
}

function resolveMeaningfulFindings(parsed: Record<string, unknown> | null): unknown {
  return resolveKey(parsed, "meaningfulFindings", "关键发现", "关键线索", "核心发现");
}

function resolveNextActions(parsed: Record<string, unknown> | null): unknown {
  return resolveKey(parsed, "nextActions", "下一步动作", "下一步", "后续动作");
}

function resolvePrioritizedFindings(parsed: Record<string, unknown> | null): unknown[] | undefined {
  const raw = resolveKey(parsed, "prioritizedFindings", "优先级发现", "优先发现");
  if (!Array.isArray(raw)) return undefined;
  return raw;
}

function normalizePrioritizedItem(item: Record<string, unknown>): { priority: string; content: string; reason: string } {
  return {
    priority: pickString(item.priority || item.优先级),
    content: pickString(item.content || item.发现 || item.内容),
    reason: pickString(item.reason || item.原因 || item.理由)
  };
}

export function parseProjectProfileCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = resolveProjectDetection(parsed);
  const projectName = pickString(rawProject.projectName || rawProject.项目名称);
  const productName = pickString(rawProject.productName || rawProject.产品名称);
  const projectCategory = pickString(rawProject.projectCategory || rawProject.项目类别);
  const evidence = pickStringList(rawProject.evidence || rawProject.依据, 4);
  const meaningfulFindings = pickStringList(resolveMeaningfulFindings(parsed), 8);
  const prioritizedFindings = parsePrioritizedFindingsFromText(content);
  const nextActions = pickStringList(resolveNextActions(parsed), 6);
  return { projectName, productName, projectCategory, evidence, meaningfulFindings, prioritizedFindings, nextActions };
}

export function listProjectProfileMissingReasons(candidate: ReturnType<typeof parseProjectProfileCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectName && !candidate.productName) reasons.push("missing projectDetection.projectName/productName");
  if (candidate.meaningfulFindings.length === 0) reasons.push("meaningfulFindings is empty");
  if (candidate.prioritizedFindings.length === 0) reasons.push("prioritizedFindings is empty");
  if (candidate.nextActions.length === 0) reasons.push("nextActions is empty");
  return reasons;
}

export function parsePrioritizedFindingsFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const raw = resolvePrioritizedFindings(parsed);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as Record<string, unknown>)
    .map((item) => normalizePrioritizedItem(item))
    .filter((item): item is { priority: "P0" | "P1" | "P2"; content: string; reason: string } =>
      (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && !!item.content)
    .slice(0, 8);
}

export function parseProjectDetectionFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = resolveProjectDetection(parsed);
  return {
    projectName: pickString(rawProject.projectName || rawProject.项目名称),
    productName: pickString(rawProject.productName || rawProject.产品名称),
    projectCategory: pickString(rawProject.projectCategory || rawProject.项目类别),
    evidence: pickStringList(rawProject.evidence || rawProject.依据, 4)
  };
}

// ---------------------------------------------------------------------------
// Release Review (merged from workspaceServiceAnalysisReleaseReviewOps)
// ---------------------------------------------------------------------------

export function parseReleaseReviewCandidate(
  content: string,
  fallbackSignals: {
    testCaseCount: number;
    p0FindingCount: number;
    unknownSignalCount: number;
    boundaryCoverage: number;
  }
) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const rollbackRaw = (parsed?.rollback ?? {}) as Record<string, unknown>;
  const signalsRaw = (parsed?.qualitySignals ?? {}) as Record<string, unknown>;
  const decisionRaw = pickString((parsed?.decision as string) || "");
  const decision: "go" | "caution" | "block" = decisionRaw === "go" || decisionRaw === "caution" || decisionRaw === "block" ? decisionRaw : "caution";
  return {
    decision,
    reason: pickString(parsed?.reason),
    score: Number.isFinite(Number(parsed?.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed?.score)))) : 0,
    blockers: pickStringList(parsed?.blockers, 16),
    releaseGates: pickStringList(parsed?.releaseGates, 16),
    recommendations: pickStringList(parsed?.recommendations, 16),
    rollback: {
      shouldRollback: Boolean(rollbackRaw.shouldRollback),
      reason: pickString(rollbackRaw.reason),
      trigger: pickString(rollbackRaw.trigger),
      actions: pickStringList(rollbackRaw.actions, 16)
    },
    qualitySignals: {
      testCaseCount: Number.isFinite(Number(signalsRaw.testCaseCount)) ? Math.max(0, Math.round(Number(signalsRaw.testCaseCount))) : fallbackSignals.testCaseCount,
      p0FindingCount: Number.isFinite(Number(signalsRaw.p0FindingCount)) ? Math.max(0, Math.round(Number(signalsRaw.p0FindingCount))) : fallbackSignals.p0FindingCount,
      unknownSignalCount: Number.isFinite(Number(signalsRaw.unknownSignalCount))
        ? Math.max(0, Math.round(Number(signalsRaw.unknownSignalCount)))
        : fallbackSignals.unknownSignalCount,
      boundaryCoverage: Number.isFinite(Number(signalsRaw.boundaryCoverage))
        ? Math.max(0, Math.min(100, Math.round(Number(signalsRaw.boundaryCoverage))))
        : fallbackSignals.boundaryCoverage
    }
  };
}

export function listReleaseReviewMissingReasons(candidate: ReturnType<typeof parseReleaseReviewCandidate>) {
  const reasons: string[] = [];
  if (!candidate.reason) reasons.push("missing reason");
  if (candidate.blockers.length === 0 && candidate.decision === "block") reasons.push("block decision without blockers");
  if (candidate.recommendations.length === 0) reasons.push("recommendations is empty");
  return reasons;
}

// ---------------------------------------------------------------------------
// Report Quality (merged from workspaceServiceAnalysisReportQualityOps)
// ---------------------------------------------------------------------------

export function parseReportQualityCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const scoreRaw = Number(parsed?.score);
  return {
    publishable: Boolean(parsed?.publishable),
    score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
    summary: pickString(parsed?.summary),
    missingItems: pickStringList(parsed?.missingItems, 16),
    actionRequired: pickStringList(parsed?.actionRequired, 16)
  };
}

export function listReportQualityMissingReasons(candidate: ReturnType<typeof parseReportQualityCandidate>) {
  const reasons: string[] = [];
  if (!candidate.summary) reasons.push("missing summary");
  if (!Number.isFinite(candidate.score)) reasons.push("missing score");
  return reasons;
}
