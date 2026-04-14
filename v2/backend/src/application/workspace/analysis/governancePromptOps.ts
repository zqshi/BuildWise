import type { AttachmentAnalysisReport, IterationAgentPrompt } from '../../../domain/workspace/types';

export function buildGovernanceInsightsPrompt(params: {
  iterationName: string;
  baselineIterationName: string;
  sourceType: "single-file" | "folder";
  excerpt: string;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  added: string[];
  changed: string[];
  removed: string[];
  requirements: string[];
  components: string[];
  codePaths: string[];
  prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
  clarificationQuestions: string[];
}): IterationAgentPrompt {
  const compactSingleFile = params.sourceType === "single-file";
  return {
    agentId: "agent-governance-insights-1",
    role: compactSingleFile ? "requirements-analyst" : "orchestrator",
    scope: "full-cycle",
    goal: "输出版本差异细化、追溯映射、可执行边界与领域知识",
    expectedOutput:
      "JSON: {versionDiffDetailed:{summary,impactScope[],riskPoints[],added[],changed[],removed[]}, traceabilityMap:{requirementToComponent[],componentToCode[],requirementToCode[],coverageScore,mappingConfidence,unmappedRequirements[],conflicts[],gaps[]}, executableConstraints:{componentWhitelist[],codePathWhitelist[],acceptanceChecks[],gateRules[]}, domainKnowledge:{terms[],rules[],unknowns[]}}",
    systemPrompt:
      "你是资深架构与治理专家。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。输出应可直接用于业务确认与执行治理。除 domainKnowledge.terms 和 traceabilityMap 中的技术映射字段外，所有 string 类型字段的值必须使用中文业务语言，禁止出现文件名路径、文件大小、英文技术缩写和框架名称。",
    userPrompt: [
      `iteration=${params.iterationName};baseline=${params.baselineIterationName}`,
      `requirements=${params.requirements.join(" | ") || "-"}`,
      `components=${params.components.join(" | ") || "-"}`,
      `codePaths=${params.codePaths.join(" | ") || "-"}`,
      `clarificationQuestions=${params.clarificationQuestions.join(" | ") || "-"}`,
      `prioritizedFindings=${params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`).join(" | ") || "-"}`,
      `versionDiff=added:${params.added.join(" | ") || "-"};changed:${params.changed.join(" | ") || "-"};removed:${params.removed.join(" | ") || "-"}`,
      `diffLocations=${params.diffLocations.map((item) => `${item.dimension}/${item.changeType}:${item.baselineItem || "-"}->${item.currentItem}`).join(" | ") || "-"}`,
      `excerpt=${params.excerpt.slice(0, compactSingleFile ? 1800 : 2600) || "-"}`,
      "要求：",
      compactSingleFile
        ? "1) versionDiffDetailed 中 added/changed/removed 每项保留最关键的 1-3 条差异，包含 dimension/item/impact/risk(low|medium|high)。"
        : "1) versionDiffDetailed 中 added/changed/removed 每项包含 dimension/item/impact/risk(low|medium|high)。",
      "2) traceabilityMap 给出可落地映射与覆盖分。",
      "3) executableConstraints 给出明确可执行白名单与门禁规则。",
      "4) domainKnowledge 给出 terms/rules/unknowns，terms 包含 mappedTo 与 bindingStrength(high|medium|low)。"
    ].join("\n\n")
  };
}

export function buildGovernanceInsightsRepairPrompt(
  prompt: IterationAgentPrompt,
  missing: string[],
  previousOutput: string,
  attempt: number
): IterationAgentPrompt {
  return {
    ...prompt,
    agentId: `agent-governance-insights-repair-${attempt}`,
    userPrompt: [
      prompt.userPrompt,
      "你上一版输出缺少必填结构，请仅输出严格 JSON 并补齐。",
      `缺失项：${missing.join("; ")}`,
      `上一版：${previousOutput.slice(0, 2400)}`
    ].join("\n\n")
  };
}
