/**
 * 交付物合成数据序列化 —— 将 ChangeControl 结构化数据转为 LLM 可读的文本上下文。
 * 纯函数，无 IO，供合成主流程调用。
 */

import type { Iteration } from '../../../domain/workspace/types';
import type { defaultIterationChangeControl } from '../shared/common';
import { sanitizeDisplayItem } from '../coach/messageSanitizer';

type ChangeControl = ReturnType<typeof defaultIterationChangeControl>;

function serializeBusinessContext(biz: ChangeControl["lastBusinessConfirmation"], sections: string[]) {
  if (biz?.coreIntent) sections.push(`核心意图: ${biz.coreIntent}`);
  if (biz?.boundarySummary) sections.push(`边界摘要: ${biz.boundarySummary}`);
  if (biz?.functionalPoints?.length) sections.push(`功能要点:\n${biz.functionalPoints.slice(0, 12).map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
  if (biz?.successCriteria?.length) sections.push(`成功标准:\n${biz.successCriteria.slice(0, 8).map((c) => `- ${c}`).join("\n")}`);
  const na = biz?.necessityAssessment;
  if (na) {
    const naLines: string[] = [];
    if (na.mustDo?.length) naLines.push(`必须完成: ${na.mustDo.join("；")}`);
    if (na.shouldDo?.length) naLines.push(`建议纳入: ${na.shouldDo.join("；")}`);
    if (na.canDefer?.length) naLines.push(`可延期: ${na.canDefer.join("；")}`);
    if (na.outOfScope?.length) naLines.push(`超出范围: ${na.outOfScope.join("；")}`);
    if (na.rationale) naLines.push(`判断依据: ${na.rationale}`);
    if (naLines.length > 0) sections.push(`必要性评估:\n${naLines.join("\n")}`);
  }
  const ii = biz?.interactionInsights;
  if (ii) {
    const iiLines: string[] = [];
    if (ii.primaryFlow?.length) iiLines.push(`主流程: ${ii.primaryFlow.join("；")}`);
    if (ii.keyInteractions?.length) iiLines.push(`关键交互: ${ii.keyInteractions.join("；")}`);
    if (ii.exceptionPaths?.length) iiLines.push(`异常路径: ${ii.exceptionPaths.join("；")}`);
    if (ii.usabilityRisks?.length) iiLines.push(`可用性风险: ${ii.usabilityRisks.join("；")}`);
    if (iiLines.length > 0) sections.push(`交互洞察:\n${iiLines.join("\n")}`);
  }
  if (biz?.versionDiffSummary) sections.push(`版本差异摘要: ${biz.versionDiffSummary}`);
  if (biz?.diffNarratives?.length) sections.push(`变更叙述: ${biz.diffNarratives.join("；")}`);
  if (biz?.confirmationChecklist?.length) {
    const items = biz.confirmationChecklist.map((c) =>
      typeof c === "string" ? c : typeof c === "object" && c !== null ? String((c as Record<string, unknown>).item || c) : String(c)
    );
    sections.push(`确认检查: ${items.join("；")}`);
  }
  const evidenceRefs = (biz as Record<string, unknown>)?.evidenceRefs;
  if (Array.isArray(evidenceRefs) && evidenceRefs.length > 0) {
    sections.push(`证据引用: ${evidenceRefs.filter((r): r is string => typeof r === "string").join("；")}`);
  }
}

function serializeInsightsAndFindings(cc: ChangeControl, sections: string[]) {
  const prioritized = cc.lastPrioritizedFindings;
  if (Array.isArray(prioritized) && prioritized.length > 0) {
    sections.push(`优先级发现:\n${prioritized.map((f) => `[${f.priority}] ${sanitizeDisplayItem(f.content)}${f.reason ? ` — ${sanitizeDisplayItem(f.reason)}` : ""}`).join("\n")}`);
  }
  if (Array.isArray(cc.lastMeaningfulFindings) && cc.lastMeaningfulFindings.length > 0) {
    sections.push(`关键发现:\n${cc.lastMeaningfulFindings.map((f) => `- ${sanitizeDisplayItem(f)}`).join("\n")}`);
  }
  const deep = cc.lastDeepInsightsSummary;
  if (deep) {
    const deepLines: string[] = [];
    if (deep.themes?.length) deepLines.push(`主题: ${deep.themes.map(sanitizeDisplayItem).join("；")}`);
    if (deep.gaps?.length) deepLines.push(`差距: ${deep.gaps.map(sanitizeDisplayItem).join("；")}`);
    if (deep.rootCauses?.length) deepLines.push(`根因: ${deep.rootCauses.map(sanitizeDisplayItem).join("；")}`);
    if (deep.decisionSuggestions?.length) deepLines.push(`决策建议: ${deep.decisionSuggestions.map(sanitizeDisplayItem).join("；")}`);
    if (deepLines.length > 0) sections.push(`深度洞察:\n${deepLines.join("\n")}`);
  }
}

function serializeDomainAndBoundary(cc: ChangeControl, sections: string[]) {
  const domainEntries = cc.domainKnowledgeEntries;
  if (Array.isArray(domainEntries) && domainEntries.length > 0) {
    const entryLines = domainEntries.slice(0, 15).map((e) => {
      const parts = [`${e.term}: ${e.definition || "无定义"}`];
      if (e.mappedApis?.length) parts.push(`接口：${e.mappedApis.join("、")}`);
      if (e.mappedEntities?.length) parts.push(`实体：${e.mappedEntities.join("、")}`);
      if (e.mappedPages?.length) parts.push(`页面：${e.mappedPages.join("、")}`);
      if (e.mappedCodePaths?.length) parts.push(`代码：${e.mappedCodePaths.join("、")}`);
      return parts.join(" | ");
    });
    sections.push(`领域知识:\n${entryLines.join("\n")}`);
  }
  const boundary = cc.boundary;
  if (boundary) {
    const bLines: string[] = [];
    if (boundary.requirementRefs?.length) bLines.push(`需求映射: ${boundary.requirementRefs.slice(0, 12).join("；")}`);
    if (boundary.componentRefs?.length) bLines.push(`受影响组件: ${boundary.componentRefs.slice(0, 12).join("；")}`);
    if (boundary.codePaths?.length) bLines.push(`代码路径: ${boundary.codePaths.slice(0, 12).join("；")}`);
    if (boundary.note) bLines.push(`备注: ${boundary.note}`);
    if (bLines.length > 0) sections.push(`变更边界:\n${bLines.join("\n")}`);
  }
  const ec = cc.executableConstraints;
  if (ec) {
    const ecLines: string[] = [];
    if (ec.componentWhitelist?.length) ecLines.push(`组件白名单: ${ec.componentWhitelist.join("；")}`);
    if (ec.codePathWhitelist?.length) ecLines.push(`代码路径白名单: ${ec.codePathWhitelist.join("；")}`);
    if (ec.acceptanceChecks?.length) ecLines.push(`验收检查项: ${ec.acceptanceChecks.join("；")}`);
    if (ecLines.length > 0) sections.push(`可执行约束:\n${ecLines.join("\n")}`);
  }
  const ts = cc.traceabilitySnapshot;
  if (ts && ts.requirementCoverage > 0) {
    sections.push(`追溯覆盖：需求覆盖率 ${ts.requirementCoverage}%，映射置信度 ${ts.mappingConfidence}${ts.unmappedRequirements?.length ? `，未映射需求：${ts.unmappedRequirements.join("；")}` : ""}${ts.conflicts?.length ? `，映射冲突：${ts.conflicts.join("；")}` : ""}`);
  }
}

function serializeQualityAndTestSignals(cc: ChangeControl, sections: string[]) {
  const ux = cc.uxArtifacts;
  if (ux) {
    const uxLines: string[] = [];
    if (ux.informationArchitecture?.length) uxLines.push(`信息架构: ${ux.informationArchitecture.join("；")}`);
    if (ux.interactionFlows?.length) uxLines.push(`交互流程: ${ux.interactionFlows.join("；")}`);
    if (ux.uiStates?.length) uxLines.push(`界面状态: ${ux.uiStates.join("；")}`);
    if (ux.uxConstraints?.length) uxLines.push(`设计约束: ${ux.uxConstraints.join("；")}`);
    if (uxLines.length > 0) sections.push(`UX 数据:\n${uxLines.join("\n")}`);
  }
  const qualityLines: string[] = [];
  if (cc.lastReportQualityScore) qualityLines.push(`报告质量评分: ${cc.lastReportQualityScore}`);
  if (cc.lastReportQualitySummary) qualityLines.push(`质量摘要: ${cc.lastReportQualitySummary}`);
  if (cc.lastReleaseReviewDecision) {
    qualityLines.push(`发布评审: ${cc.lastReleaseReviewDecision}${cc.lastReleaseReviewReason ? ` — ${cc.lastReleaseReviewReason}` : ""}`);
  }
  if (cc.lastReleaseReviewBlockers?.length) qualityLines.push(`阻断项: ${cc.lastReleaseReviewBlockers.join("；")}`);
  if (qualityLines.length > 0) sections.push(`质量信号:\n${qualityLines.join("\n")}`);
  const matrix = cc.generatedTestMatrix || [];
  if (matrix.length > 0) {
    const passed = matrix.filter((tc) => tc.executionStatus === "passed").length;
    const failed = matrix.filter((tc) => tc.executionStatus === "failed").length;
    sections.push(`测试矩阵: 共${matrix.length}用例, 通过${passed}, 失败${failed}, 待执行${matrix.length - passed - failed}`);
  }
  if (cc.clarificationQuestions?.length) {
    sections.push(`待澄清问题: ${cc.clarificationQuestions.join("；")}`);
  }
}

export function serializeAvailableData(iteration: Iteration, cc: ChangeControl): string {
  const scope = iteration.scope;
  const assessment = iteration.assessment;
  const continuity = iteration.continuity;
  const sections: string[] = [];

  sections.push([
    `迭代名称: ${iteration.name}`,
    `迭代描述: ${iteration.description}`,
    `迭代状态: ${iteration.status}`,
    `版本: ${iteration.version || "未指定"}`,
    iteration.goals?.length ? `迭代目标: ${iteration.goals.join("；")}` : "",
  ].filter(Boolean).join("\n"));

  serializeBusinessContext(cc.lastBusinessConfirmation, sections);
  serializeInsightsAndFindings(cc, sections);
  serializeDomainAndBoundary(cc, sections);

  if (scope.inScope?.length) sections.push(`纳入范围: ${scope.inScope.join("；")}`);
  if (scope.outOfScope?.length) sections.push(`排除范围: ${scope.outOfScope.join("；")}`);
  if (scope.acceptanceCriteria?.length) sections.push(`验收标准: ${scope.acceptanceCriteria.join("；")}`);
  if (Array.isArray(assessment?.risks) && assessment.risks.length > 0) {
    sections.push(`已识别风险: ${assessment.risks.join("；")}`);
  }
  if (continuity?.inheritedFromIterationId) {
    sections.push(`继承自迭代: ${continuity.inheritedFromIterationId}${continuity.inheritedSummary ? ` — ${continuity.inheritedSummary}` : ""}`);
  }

  serializeQualityAndTestSignals(cc, sections);
  const result = sections.join("\n\n");
  return result.length > 8000 ? `${result.slice(0, 8000)}\n…（上下文已截断）` : result;
}
