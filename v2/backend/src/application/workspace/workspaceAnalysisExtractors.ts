import type { AttachmentAnalysisReport, IterationAgentOutput } from "../../domain/workspace/types";
import { safeJsonParse } from "./workspaceServiceAttachmentUtils";

/**
 * @deprecated Use safeJsonParse from workspaceServiceAttachmentUtils instead.
 * Kept as a re-export for backward compatibility with existing consumers.
 */
export const parseJsonObjectFromText = safeJsonParse;

export function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function pickStringList(value: unknown, max = 8) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, max);
}

export function isLowSignalText(value: string) {
  const normalized = (value || "").trim();
  if (!normalized) return true;
  if (normalized.length < 8) return true;
  return /暂无|无明显|待补充|可继续确认|按需补充|请结合业务验收|后续确认/.test(normalized);
}

export function listParsedRoleOutputs(agentOutputs: IterationAgentOutput[], role: IterationAgentOutput["role"]) {
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
