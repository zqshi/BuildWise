/**
 * qualityAuditAgentOps — 合并版 Quality Audit Agent
 *
 * 合并旧 Agent：
 * - agent-report-quality-gate（报告质量评审：publishable/score/summary）
 * - agent-release-review（发布评审：decision/blockers/releaseGates/rollback）
 *
 * 输入：Phase 2 + Phase 3 的结构化输出（非 excerpt），不需要分片。
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { AttachmentAnalysisReport, IterationAgentPrompt } from '../../../domain/workspace/types';
import { parseReportQualityCandidate, listReportQualityMissingReasons } from './governanceOps';
import { parseReleaseReviewCandidate, listReleaseReviewMissingReasons } from './releaseReviewOps';
import { hydrateReportQualityCandidate, hydrateReleaseReviewCandidate } from './governanceHydrationOps';
import { runAnalysisPrompt } from './configOps';
import { formatPrioritizedFindings, formatQualitySignals, formatSourceType, parseJsonObjectFromText } from './extractors';
import { sanitizeDisplayItem } from '../coach/messageSanitizer';

export type QualityAuditResult = {
  quality: AttachmentAnalysisReport["reportQuality"];
  release: AttachmentAnalysisReport["releaseReview"];
};

function buildQualityAuditPrompt(params: Parameters<typeof runQualityAuditAgent>[1]): IterationAgentPrompt {
  const compact = params.sourceType === "single-file";
  return {
    agentId: compact ? "agent-quality-audit-compact-1" : "agent-quality-audit-1",
    role: compact ? "requirements-analyst" : "orchestrator",
    scope: "release",
    goal: "同时评审报告质量和发布就绪度",
    expectedOutput: "JSON: 包含 quality（报告质量评审）和 release（发布就绪评审）两部分",
    systemPrompt: [
      "你同时担任报告质量审计官和发布治理负责人。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文字。",
      "quality.summary 必须用业务决策者可理解的语言，说明当前报告能支撑做出什么层面的决策。",
      "release.decision 只能是 go/caution/block。",
      "禁止使用以下措辞：「未实际分析」「信息量不足」「文件数为0」等技术性表述。"
    ].join("\n"),
    userPrompt: [
      `迭代名称：${params.iterationName}；分析对象：${params.analyzedTarget}；来源类型：${formatSourceType(params.sourceType)}`,
      "",
      "=== 报告质量评审上下文 ===",
      `核心意图：${params.businessConfirmation.coreIntent || "未识别"}`,
      `成功标准：${params.businessConfirmation.successCriteria.join("；") || "未定义"}`,
      `本迭代必须完成：${params.businessConfirmation.necessityAssessment.mustDo.join("；") || "未定义"}`,
      `必要性理由：${params.businessConfirmation.necessityAssessment.rationale || "未说明"}`,
      `证据来源：${params.businessConfirmation.evidenceRefs.join("；") || "无"}`,
      `信息覆盖率：${params.deepInsights.coverage.coveragePercent}%`,
      `根因识别：${params.deepInsights.crossFileInsights.rootCauses.map(sanitizeDisplayItem).join("；") || "无"}`,
      `决策建议：${params.deepInsights.crossFileInsights.decisionSuggestions.map(sanitizeDisplayItem).join("；") || "无"}`,
      `待澄清问题：${params.clarificationQuestions.join("；") || "无"}`,
      "",
      "=== 发布评审上下文 ===",
      formatQualitySignals(params.qualitySignals),
      formatPrioritizedFindings(params.prioritizedFindings),
      `候选阻断项：${params.blockers.join("；") || "无"}`,
      `发布门禁：${params.releaseGates.join("；") || "无"}`,
      `回滚方案：${params.rollbackPlan.join("；") || "无"}`,
      `建议：${params.recommendations.join("；") || "无"}`,
      `附件节选：${params.excerpt.slice(0, compact ? 1200 : 1800) || "无"}`,
      "",
      "输出要求：",
      "quality 部分：publishable(bool), score(0-100), summary(1-2句), missingItems[], actionRequired[]",
      "release 部分：decision(go/caution/block), reason, score(0-100), blockers[], releaseGates[], recommendations[], rollback({shouldRollback,reason,trigger,actions[]}), qualitySignals"
    ].join("\n")
  };
}

export async function runQualityAuditAgent(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    analyzedTarget: string;
    sourceType: "single-file" | "folder";
    excerpt: string;
    // Phase 2 输出
    deepInsights: AttachmentAnalysisReport["deepInsights"];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    traceabilityMap: AttachmentAnalysisReport["traceabilityMap"];
    // Phase 3 输出
    businessConfirmation: AttachmentAnalysisReport["businessConfirmation"];
    clarificationQuestions: string[];
    // 质量信号
    qualitySignals: {
      testCaseCount: number;
      p0FindingCount: number;
      unknownSignalCount: number;
      boundaryCoverage: number;
    };
    // 发布评审候选
    blockers: string[];
    releaseGates: string[];
    rollbackPlan: string[];
    recommendations: string[];
  }
): Promise<QualityAuditResult> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured.");
  }
  const prompt = buildQualityAuditPrompt(params);
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let { quality, release } = parseQualityAuditResponse(selected.content, params.qualitySignals);

  // hydration 兜底
  quality = hydrateReportQualityCandidate(quality, params);
  release = hydrateReleaseReviewCandidate(release, params);

  // 检查 quality 和 release 各自的缺失项
  const qualityMissing = listReportQualityMissingReasons(quality);
  const releaseMissing = listReleaseReviewMissingReasons(release);
  const allMissing = [...qualityMissing.map((m) => `quality:${m}`), ...releaseMissing.map((m) => `release:${m}`)];

  for (let attempt = 1; attempt <= 2 && allMissing.length > 0; attempt++) {
    const repairPrompt: IterationAgentPrompt = {
      ...prompt,
      agentId: `agent-quality-audit-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出缺少必填字段，请仅输出严格 JSON。",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        `缺失项：${allMissing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    const repaired = parseQualityAuditResponse(selected.content, params.qualitySignals);
    quality = hydrateReportQualityCandidate(repaired.quality, params);
    release = hydrateReleaseReviewCandidate(repaired.release, params);

    const newQualityMissing = listReportQualityMissingReasons(quality);
    const newReleaseMissing = listReleaseReviewMissingReasons(release);
    allMissing.length = 0;
    allMissing.push(...newQualityMissing.map((m) => `quality:${m}`), ...newReleaseMissing.map((m) => `release:${m}`));
  }

  if (allMissing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("quality-audit");
    log.warn("quality audit incomplete after repair", { missing: allMissing.join(", ") });
  }

  return { quality, release };
}

function parseQualityAuditResponse(
  content: string,
  fallbackSignals: { testCaseCount: number; p0FindingCount: number; unknownSignalCount: number; boundaryCoverage: number }
) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;

  // quality 可能在 quality 子对象或顶层
  const qualityRaw = (parsed?.quality ?? parsed) as Record<string, unknown> | null;
  const quality = parseReportQualityCandidate(
    qualityRaw && qualityRaw !== parsed
      ? JSON.stringify(qualityRaw)
      : content
  );

  // release 可能在 release 子对象或顶层
  const releaseRaw = (parsed?.release ?? parsed) as Record<string, unknown> | null;
  const release = parseReleaseReviewCandidate(
    releaseRaw && releaseRaw !== parsed
      ? JSON.stringify(releaseRaw)
      : content,
    fallbackSignals
  );

  return { quality, release };
}
