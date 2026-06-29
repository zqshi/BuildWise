import type { AttachmentAnalysisReport, IterationAgentOutput } from '../../../domain/workspace/types';
export { pickString, pickStringList } from '../../../shared/utils';
import { pickString, pickStringList } from '../../../shared/utils';
import { safeJsonParse } from '../upload/attachmentUtils';

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
  if (/暂无|无明显|待补充|可继续确认|按需补充|请结合业务验收|后续确认/.test(normalized)) return true;
  // LLM 程序性自引用：描述分析流程本身而非业务内容
  if (/由系统自动|推进.*阶段|生成.*报告|提取.*信息并|系统.*自动提取|等待.*分析|尚未生成|尚处于起步/.test(normalized)) return true;
  return false;
}

function listParsedRoleOutputs(agentOutputs: IterationAgentOutput[], role: IterationAgentOutput["role"]) {
  return agentOutputs
    .filter((item) => item.role === role && item.status === "success")
    .map((item) => parseJsonObjectFromText(item.content))
    .filter((item): item is Record<string, unknown> => Boolean(item));
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

// ---------------------------------------------------------------------------
// Prompt 数据格式化：将内部结构转为中文自然语言，供 agent userPrompt 使用
// ---------------------------------------------------------------------------

export function formatSourceType(type: string): string {
  return type === "single-file" ? "单文件" : "文件夹";
}

export function formatFileStats(stats: { totalFiles: number; textFiles: number; binaryFiles: number }): string {
  return `文件统计：共 ${stats.totalFiles} 个文件，文本文件 ${stats.textFiles} 个，二进制文件 ${stats.binaryFiles} 个`;
}

export function formatVersionDiff(diff: { added: string[]; changed: string[]; removed: string[] }): string {
  const a = diff.added.length > 0 ? diff.added.join("；") : "无";
  const c = diff.changed.length > 0 ? diff.changed.join("；") : "无";
  const r = diff.removed.length > 0 ? diff.removed.join("；") : "无";
  return `版本差异：新增 ${a}；修改 ${c}；移除 ${r}`;
}

export function formatDiffLocations(locs: Array<{ dimension: string; changeType: string; baselineItem?: string; currentItem: string }>): string {
  if (locs.length === 0) return "差异定位：无";
  const dimMap: Record<string, string> = { goals: "目标", inScope: "范围内", outOfScope: "范围外", acceptanceCriteria: "验收标准", requirements: "需求", components: "组件", codePaths: "代码路径" };
  const ctMap: Record<string, string> = { added: "新增", removed: "移除", changed: "变更", modified: "修改" };
  const items = locs.map((d) => `${dimMap[d.dimension] || d.dimension}/${ctMap[d.changeType] || d.changeType}：${d.baselineItem || "无"}→${d.currentItem}`).join("；");
  return `差异定位：${items}`;
}

export function formatQualitySignals(sig: { testCaseCount: number; p0FindingCount: number; unknownSignalCount: number; boundaryCoverage: number; ontologyTermCount?: number; ontologyRuleCount?: number }): string {
  const parts = [
    `测试用例 ${sig.testCaseCount} 个`,
    `高优先级问题 ${sig.p0FindingCount} 个`,
    `未知信号 ${sig.unknownSignalCount} 个`,
    `边界覆盖率 ${sig.boundaryCoverage}%`
  ];
  if (sig.ontologyTermCount != null) parts.push(`本体术语 ${sig.ontologyTermCount} 个`);
  if (sig.ontologyRuleCount != null) parts.push(`本体规则 ${sig.ontologyRuleCount} 个`);
  return `质量信号：${parts.join("，")}`;
}

export function formatBoundaries(requirements: string[], components: string[], codePaths: string[]): string {
  const fmt = (items: string[], limit: number) => {
    if (items.length === 0) return "无";
    if (items.length <= limit) return items.join("；");
    return `${items.slice(0, limit).join("；")}等共 ${items.length} 项`;
  };
  return [
    `需求边界：${fmt(requirements, 12)}`,
    `组件边界：${fmt(components, 12)}`,
    `代码边界：${fmt(codePaths, 12)}`
  ].join("\n");
}

export function formatPrioritizedFindings(findings: Array<{ priority: string; content: string }>): string {
  if (findings.length === 0) return "关键发现：无";
  return `关键发现：${findings.map((f) => `[${f.priority}] ${f.content}`).join("；")}`;
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
    reasons.push("未识别到项目或产品名称");
  }
  if (params.meaningfulFindings.length === 0 || params.meaningfulFindings.every(isLowSignalText)) {
    reasons.push("关键发现信息量不足");
  }
  if (params.prioritizedFindings.length === 0) {
    reasons.push("优先级发现为空");
  }
  if (params.nextActions.length === 0 || params.nextActions.every(isLowSignalText)) {
    reasons.push("下一步行动信息量不足");
  }
  if (!params.businessConfirmation.coreIntent || isLowSignalText(params.businessConfirmation.coreIntent)) {
    reasons.push("核心意图信息量不足");
  }
  if (!Array.isArray(params.businessConfirmation.functionalPoints) || params.businessConfirmation.functionalPoints.length === 0) {
    reasons.push("功能要点为空");
  }
  if (!params.businessConfirmation.versionDiffSummary || isLowSignalText(params.businessConfirmation.versionDiffSummary)) {
    reasons.push("版本差异摘要信息量不足");
  }
  if (!params.reportQuality.summary || isLowSignalText(params.reportQuality.summary)) {
    reasons.push("报告质量摘要信息量不足");
  }
  if (params.outputList.length === 0) {
    reasons.push("分析输出为空");
  }
  return reasons;
}
