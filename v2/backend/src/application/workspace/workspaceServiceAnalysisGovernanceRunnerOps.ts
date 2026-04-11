import { LlmUnavailableError, type AgentRunOptions, type AgentRunResult, type AgentRunner } from "./agentRunner";
import type { AttachmentAnalysisReport, IterationAgentPrompt, VisionPayload } from "../../domain/workspace/types";
import { listBusinessConfirmationMissingReasons, parseBusinessConfirmationCandidate } from "./workspaceServiceAnalysisBusinessConfirmationOps";
import { listGovernanceInsightsMissingReasons, parseGovernanceInsightsCandidate } from "./workspaceServiceAnalysisGovernanceOps";
import { buildGovernanceInsightsPrompt, buildGovernanceInsightsRepairPrompt } from "./workspaceServiceAnalysisGovernancePromptOps";
import { listReleaseReviewMissingReasons, parseReleaseReviewCandidate } from "./workspaceServiceAnalysisReleaseReviewOps";
import { listReportQualityMissingReasons, parseReportQualityCandidate } from "./workspaceServiceAnalysisReportQualityOps";
import { hydrateGovernanceInsightsCandidate, hydrateReleaseReviewCandidate, hydrateReportQualityCandidate } from "./workspaceServiceAnalysisGovernanceHydrationOps";
type RunAnalysisPrompt = (agentRunner: AgentRunner, prompt: IterationAgentPrompt, options?: AgentRunOptions) => Promise<AgentRunResult>;
export async function synthesizeBusinessConfirmationOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    baselineIterationName: string;
    analyzedTarget: string;
    sourceType: "single-file" | "folder";
    excerpt: string;
    requirements: string[];
    components: string[];
    codePaths: string[];
    clarificationQuestions: string[];
    versionDiff: { added: string[]; changed: string[]; removed: string[] };
    diffLocations: AttachmentAnalysisReport["diffLocations"];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    visionPayloads?: VisionPayload[];
  },
  deps: {
    runAnalysisPrompt: RunAnalysisPrompt;
  }
) {
  const compactSingleFile = params.sourceType === "single-file";
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const confirmationRole: "requirements-analyst" | "orchestrator" = compactSingleFile
    ? "requirements-analyst"
    : "orchestrator";
  const prompt = {
    agentId: compactSingleFile ? "agent-business-confirmation-compact-1" : "agent-business-confirmation-1",
    role: confirmationRole,
    scope: "attachment" as const,
    goal: "输出可让业务角色直接确认的边界与版本差异说明",
    expectedOutput:
      "JSON: {coreIntent, successCriteria[], interactionInsights:{primaryFlow[],keyInteractions[],exceptionPaths[],usabilityRisks[]}, necessityAssessment:{mustDo[],shouldDo[],canDefer[],outOfScope[],rationale}, evidenceRefs[], boundarySummary, functionalPoints[], confirmationChecklist:[{order,impactLevel,item,rationale}], versionDiffSummary, diffNarratives[], diffConfirmationOrder:[{order,impactLevel,item,rationale}]}",
    systemPrompt:
      "你是资深产品负责人。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，禁止解释性前后文。内容必须让非技术业务人员可直接理解并确认。impactLevel 只能是 高/中/低。",
    userPrompt: [
      `iteration=${params.iterationName}`,
      `baseline=${params.baselineIterationName || "无基线"}`,
      `target=${params.analyzedTarget};sourceType=${params.sourceType}`,
      `需求边界=${params.requirements.join(" | ") || "-"}`,
      `组件边界=${params.components.join(" | ") || "-"}`,
      `代码边界=${params.codePaths.join(" | ") || "-"}`,
      `澄清问题=${params.clarificationQuestions.join(" | ") || "-"}`,
      `版本差异=新增:${params.versionDiff.added.join(" | ") || "-"};修改:${params.versionDiff.changed.join(" | ") || "-"};移除:${params.versionDiff.removed.join(" | ") || "-"}`,
      `差异定位=${params.diffLocations.map((item) => `${item.dimension}/${item.changeType}:${item.baselineItem || "-"}->${item.currentItem}`).join(" | ") || "-"}`,
      `优先级发现=${params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`).join(" | ") || "-"}`,
      `附件文本节选=${params.excerpt.slice(0, compactSingleFile ? 1800 : 2800) || "-"}`,
      "输出要求：",
      "0) coreIntent: 一句话说明上传附件的核心任务与业务目标。",
      compactSingleFile ? "0.1) successCriteria: 3-5条可验证成功标准。" : "0.1) successCriteria: 3-8条可验证成功标准。",
      "0.2) interactionInsights: 必须包含 primaryFlow/keyInteractions/exceptionPaths/usabilityRisks，说明关键交互与异常路径。",
      "0.3) necessityAssessment: 必须包含 mustDo/shouldDo/canDefer/outOfScope/rationale，体现对当前迭代是否必要的判断。",
      compactSingleFile ? "0.4) evidenceRefs: 2-6条证据，格式建议“文件名/路径: 证据点”。" : "0.4) evidenceRefs: 3-12条证据，格式建议“文件名/路径: 证据点”。",
      "1) boundarySummary: 一段业务可读边界总结。",
      compactSingleFile ? "2) functionalPoints: 4-8条需求功能点描述。" : "2) functionalPoints: 5-12条需求功能点描述。",
      compactSingleFile ? "3) confirmationChecklist: 3-6条，必须给 order(1..n)、impactLevel(高/中/低)、item、rationale。" : "3) confirmationChecklist: 4-10条，必须给 order(1..n)、impactLevel(高/中/低)、item、rationale。",
      "4) versionDiffSummary: 对比上版本的业务影响摘要。",
      compactSingleFile ? "5) diffNarratives: 3-6条业务化差异描述。" : "5) diffNarratives: 4-12条业务化差异描述。",
      compactSingleFile ? "6) diffConfirmationOrder: 2-5条，按优先级顺序给出需确认的差异项。" : "6) diffConfirmationOrder: 3-10条，按优先级顺序给出需确认的差异项。"
    ].join("\n\n")
  };
  const imageDataUrls = (params.visionPayloads || []).map((item) => item.dataUrl).filter(Boolean);
  let selected = await deps.runAnalysisPrompt(agentRunner, prompt, { imageDataUrls });
  let candidate = parseBusinessConfirmationCandidate(selected.content);
  let missing = listBusinessConfirmationMissingReasons(candidate);
  const repairLimit = compactSingleFile ? 1 : 2;
  for (let attempt = 1; attempt <= repairLimit && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-business-confirmation-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出不满足必填字段，请仅输出严格 JSON 并补齐缺失项。",
        `缺失项：${missing.join("; ")}`,
        `上一版：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await deps.runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    candidate = parseBusinessConfirmationCandidate(selected.content);
    missing = listBusinessConfirmationMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("biz-confirm");
    log.warn("business confirmation incomplete after repair", { missing: missing.join(", ") });
  }
  return candidate;
}
export async function synthesizeReportQualityGateOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    analyzedTarget: string;
    sourceType: "single-file" | "folder";
    deepInsights: AttachmentAnalysisReport["deepInsights"];
    businessConfirmation: AttachmentAnalysisReport["businessConfirmation"];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    clarificationQuestions: string[];
  },
  deps: {
    runAnalysisPrompt: RunAnalysisPrompt;
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const compactSingleFile = params.sourceType === "single-file";
  const qualityRole: "requirements-analyst" | "orchestrator" = compactSingleFile ? "requirements-analyst" : "orchestrator";
  const prompt = {
    agentId: compactSingleFile ? "agent-report-quality-gate-compact-1" : "agent-report-quality-gate-1",
    role: qualityRole,
    scope: "attachment" as const,
    goal: "评审当前分析报告是否达到可发布质量",
    expectedOutput: "JSON: {publishable,score,summary,missingItems[],actionRequired[]}",
    systemPrompt:
      "你是报告质量审计官。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不输出解释文本。以业务可决策性和证据完整性为核心判定是否可发布。",
    userPrompt: [
      `迭代名称：${params.iterationName}；分析对象：${params.analyzedTarget}；来源类型：${params.sourceType}`,
      `核心意图：${params.businessConfirmation.coreIntent || "未识别"}`,
      `成功标准：${params.businessConfirmation.successCriteria.join("；") || "未定义"}`,
      `本迭代必须完成的事项：${params.businessConfirmation.necessityAssessment.mustDo.join("；") || "未定义"}`,
      `必要性理由：${params.businessConfirmation.necessityAssessment.rationale || "未说明"}`,
      `证据来源：${params.businessConfirmation.evidenceRefs.join("；") || "无"}`,
      `材料覆盖率：${params.deepInsights.coverage.coveragePercent}%`,
      `已分析文件数：${params.deepInsights.fileInsights.length}`,
      `跨模块根因分析：${params.deepInsights.crossFileInsights.rootCauses.join("；") || "无"}`,
      `决策建议：${params.deepInsights.crossFileInsights.decisionSuggestions.join("；") || "无"}`,
      `关键发现：${params.prioritizedFindings.map((item) => `[${item.priority}] ${item.content}`).join("；") || "无"}`,
      `待澄清问题：${params.clarificationQuestions.join("；") || "无"}`,
      "评分口径：",
      "1) 是否明确回答“是什么、要做什么、为何本迭代必要”。",
      "2) 是否包含证据与可执行动作。",
      "3) 是否给出跨文件根因与决策建议。",
      "输出要求：",
      "1) publishable: true/false",
      "2) score: 0-100",
      compactSingleFile ? "3) summary: 1句质量结论" : "3) summary: 1-2句质量结论",
      "4) missingItems: 缺失项列表（可为空）",
      "5) actionRequired: 需补充动作列表（可为空）"
    ].join("\n\n")
  };
  let selected = await deps.runAnalysisPrompt(agentRunner, prompt);
  let candidate = hydrateReportQualityCandidate(parseReportQualityCandidate(selected.content), params);
  let missing = listReportQualityMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-report-quality-gate-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出缺少必填字段，请仅输出严格 JSON。",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 1800)}`
      ].join("\n\n")
    };
    selected = await deps.runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = hydrateReportQualityCandidate(parseReportQualityCandidate(selected.content), params);
    missing = listReportQualityMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("report-quality");
    log.warn("report quality incomplete after repair", { missing: missing.join(", ") });
  }
  return candidate;
}
export async function synthesizeGovernanceInsightsOp(
  agentRunner: AgentRunner | null,
  params: {
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
  },
  deps: {
    runAnalysisPrompt: RunAnalysisPrompt;
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const prompt = buildGovernanceInsightsPrompt(params);
  let selected = await deps.runAnalysisPrompt(agentRunner, prompt);
  let candidate = hydrateGovernanceInsightsCandidate(parseGovernanceInsightsCandidate(selected.content), params);
  let missing = listGovernanceInsightsMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = buildGovernanceInsightsRepairPrompt(prompt, missing, selected.content, attempt);
    selected = await deps.runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = hydrateGovernanceInsightsCandidate(parseGovernanceInsightsCandidate(selected.content), params);
    missing = listGovernanceInsightsMissingReasons(candidate);
  }
  // Governance insights are best-effort: if still incomplete after repair, log and return what we have
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("gov-insights");
    log.warn("governance insights incomplete after repair", { missing: missing.join(", ") });
  }
  return candidate;
}
export async function synthesizeReleaseReviewOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    sourceType: "single-file" | "folder";
    excerpt: string;
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    blockers: string[];
    releaseGates: string[];
    rollbackPlan: string[];
    recommendations: string[];
    qualitySignals: {
      testCaseCount: number;
      p0FindingCount: number;
      unknownSignalCount: number;
      boundaryCoverage: number;
      ontologyTermCount?: number;
      ontologyRuleCount?: number;
    };
  },
  deps: {
    runAnalysisPrompt: RunAnalysisPrompt;
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const compactSingleFile = params.sourceType === "single-file";
  const releaseRole: "requirements-analyst" | "orchestrator" = compactSingleFile ? "requirements-analyst" : "orchestrator";
  const prompt = {
    agentId: compactSingleFile ? "agent-release-review-compact-1" : "agent-release-review-1",
    role: releaseRole,
    scope: "release" as const,
    goal: "输出发布评审结论",
    expectedOutput: "JSON: {decision,reason,score,blockers,releaseGates,recommendations,rollback:{shouldRollback,reason,trigger,actions},qualitySignals:{testCaseCount,p0FindingCount,unknownSignalCount,boundaryCoverage}}",
    systemPrompt:
      "你是发布治理负责人。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文字。decision 只能是 go/caution/block。",
    userPrompt: [
      `iteration=${params.iterationName}`,
      `qualitySignals=testCaseCount:${params.qualitySignals.testCaseCount};p0:${params.qualitySignals.p0FindingCount};unknown:${params.qualitySignals.unknownSignalCount};boundaryCoverage:${params.qualitySignals.boundaryCoverage};ontologyTerms:${params.qualitySignals.ontologyTermCount ?? 0};ontologyRules:${params.qualitySignals.ontologyRuleCount ?? 0}`,
      `prioritizedFindings=${params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`).join(" | ") || "-"}`,
      `candidateBlockers=${params.blockers.join(" | ") || "-"}`,
      `candidateReleaseGates=${params.releaseGates.join(" | ") || "-"}`,
      `rollbackPlan=${params.rollbackPlan.join(" | ") || "-"}`,
      `recommendations=${params.recommendations.join(" | ") || "-"}`,
      `excerpt=${params.excerpt.slice(0, compactSingleFile ? 1600 : 2200) || "-"}`,
      compactSingleFile ? "要求：给出最小可执行的 decision/reason/score/blockers/releaseGates/recommendations 与 rollback 方案。" : "要求：给出可执行 decision/reason/score/blockers/releaseGates/recommendations 与 rollback 方案。"
    ].join("\n\n")
  };
  let selected = await deps.runAnalysisPrompt(agentRunner, prompt);
  let candidate = hydrateReleaseReviewCandidate(parseReleaseReviewCandidate(selected.content, params.qualitySignals), params);
  let missing = listReleaseReviewMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-release-review-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并补齐缺失字段。",
        `缺失项：${missing.join("; ")}`,
        `上一版：${selected.content.slice(0, 2200)}`
      ].join("\n\n")
    };
    selected = await deps.runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = hydrateReleaseReviewCandidate(parseReleaseReviewCandidate(selected.content, params.qualitySignals), params);
    missing = listReleaseReviewMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("release-review");
    log.warn("release review incomplete after repair", { missing: missing.join(", ") });
  }
  return candidate;
}
