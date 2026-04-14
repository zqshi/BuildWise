/**
 * coreAnalysisAgentOps — 合并版 Core Analysis Agent
 *
 * 合并以下旧 Agent 的职责为一次 LLM 调用：
 * - report-synthesis (projectDetection + meaningfulFindings + prioritizedFindings + nextActions)
 * - attachment-insights (projectCategory + artifactType + keyCharacteristics)
 * - deep-insights (fileInsights + crossFileInsights)
 * - governance-insights (traceabilityMap + executableConstraints + domainKnowledge + versionDiffDetailed)
 *
 * 支持分片：excerpt 超过 chunkBudget 时，自动分 N 片并发调用后确定性合并。
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { AttachmentAnalysisReport, IterationAgentPrompt, VisionPayload } from '../../../domain/workspace/types';
import { parseProjectProfileCandidate } from './projectProfileOps';
import { parseDeepInsightsCandidate } from './deepInsightsOps';
import { parseGovernanceInsightsCandidate } from './governanceOps';
import { normalizeConfidence, parseJsonObjectFromText, pickString, pickStringList } from './extractors';
import { type CoreAnalysisChunkResult, mergeCoreAnalysisChunks } from './chunkMergeOps';
import { planChunks, batchArray } from './chunkingOps';
import { type ChunkConfig, runAnalysisPrompt } from './configOps';

// ---------------------------------------------------------------------------
// Prompt 构建
// ---------------------------------------------------------------------------

function buildCoreAnalysisSystemPrompt(isCompact: boolean): string {
  return [
    isCompact ? "你是资深需求分析师。" : "你是资深产品与技术分析师。",
    "你必须只输出严格 JSON（不要用 ```json 包裹），不得输出任何解释文字。所有 JSON key 必须使用英文。",
    "输出 schema 包含以下顶层字段（全部必填）：",
    "1) projectDetection: {projectName, productName, projectCategory, evidence[]}",
    "2) meaningfulFindings: string[] — 关键发现，每条需具体、可验证",
    "3) prioritizedFindings: [{priority:'P0'|'P1'|'P2', content, reason}]",
    "4) nextActions: string[]",
    "5) attachmentInsights: {projectCategory, artifactType, keyCharacteristics[], versionChangeSummary, confidence:'high'|'medium'|'low', limitations[]}",
    "6) deepInsights: {coverage:{consideredFiles,analyzedFiles,partialFiles,failedFiles,coveragePercent}, fileInsights:[{path,fileName,mimeType,size,kind,status,mainContent,requiredWork,iterationValue,summary,keyPoints[],risks[],optimizeItems[],keepItems[],recommendedActions[],openQuestions[],citations[],confidence}], crossFileInsights:{themes[],conflicts[],gaps[],recommendations[],conflictChains[],rootCauses[],impactScope[],decisionSuggestions[]}}",
    "7) traceabilityMap: {requirementToComponent:[{requirement,components[],evidence}], componentToCode:[{component,codePaths[],evidence}], requirementToCode:[{requirement,codePaths[],evidence}], coverageScore:0-100, mappingConfidence:'high'|'medium'|'low', unmappedRequirements[], conflicts[], gaps[]}",
    "8) executableConstraints: {componentWhitelist[], codePathWhitelist[], acceptanceChecks[], gateRules[]}",
    "9) domainKnowledge: {terms:[{term,definition,mappedTo:{pages[],apis[],entities[],codePaths[]},evidence,bindingStrength:'high'|'medium'|'low'}], rules[], unknowns[]}",
    "10) versionDiffDetailed: {summary, impactScope[], riskPoints[], added:[{dimension,item,impact,risk}], changed:[{dimension,item,impact,risk}], removed:[{dimension,item,impact,risk}]}",
    "11) clarificationQuestions: string[] — 仍存疑需向用户确认的问题",
    "12) risks: string[]",
    "13) suggestions: string[]"
  ].join("\n");
}

function buildCoreAnalysisUserPrompt(
  params: CoreAnalysisParams,
  excerpt: string,
  chunkInfo?: { index: number; total: number; fileRange: string; digest: string }
): string {
  const isCompact = params.sourceType === "single-file";
  const lines: string[] = [];

  if (chunkInfo) {
    lines.push(
      `你正在分析一份大型文档的第 ${chunkInfo.index + 1}/${chunkInfo.total} 部分。`,
      `整体文档概要：${chunkInfo.digest}`,
      `本片段覆盖：${chunkInfo.fileRange}`,
      "请基于本片段内容输出分析结果。后续系统会将所有分片结果合并。",
      "对于本片段中信息不足的字段，输出空值即可（如 [] 或 \"\"），不要猜测其他片段的内容。",
      ""
    );
  }

  lines.push(
    `分析目标=${params.analyzedTarget};sourceType=${params.sourceType};iteration=${params.iterationName}`,
    `文件统计=total:${params.fileStats.totalFiles},text:${params.fileStats.textFiles},binary:${params.fileStats.binaryFiles}`,
    `版本差异=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${params.versionDiff.removed.join(" | ") || "-"}`,
    `需求边界=${params.requirements.join(" | ") || "-"}`,
    `组件边界=${params.components.join(" | ") || "-"}`,
    `代码边界=${params.codePaths.join(" | ") || "-"}`,
    `差异定位=${params.diffLocations.map((d) => `${d.dimension}/${d.changeType}:${d.baselineItem || "-"}->${d.currentItem}`).join(" | ") || "-"}`,
    `附件内容:\n${excerpt || "无"}`,
    "",
    "输出要求：",
    isCompact
      ? "projectDetection(evidence≤3) + meaningfulFindings(2-4条) + prioritizedFindings(≤4) + nextActions(≤3) + attachmentInsights(keyCharacteristics 1-4) + deepInsights(fileInsights逐文件) + traceabilityMap + executableConstraints + domainKnowledge(terms≤6) + versionDiffDetailed + clarificationQuestions + risks + suggestions"
      : "projectDetection(evidence≤6) + meaningfulFindings(2-8条) + prioritizedFindings(≤8) + nextActions(≤6) + attachmentInsights(keyCharacteristics 1-8) + deepInsights(fileInsights逐文件) + traceabilityMap + executableConstraints + domainKnowledge(terms≤12) + versionDiffDetailed + clarificationQuestions + risks + suggestions"
  );

  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Parse：将单次 LLM 输出解析为 CoreAnalysisChunkResult
// ---------------------------------------------------------------------------

function parseCoreAnalysisResponse(content: string): CoreAnalysisChunkResult {
  const profile = parseProjectProfileCandidate(content);
  const deep = parseDeepInsightsCandidate(content);
  const gov = parseGovernanceInsightsCandidate(content);

  // attachmentInsights 独立提取
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const aiRaw = (parsed?.attachmentInsights ?? {}) as Record<string, unknown>;

  const confidence = profile.evidence.length >= 3 ? "high" : profile.evidence.length >= 1 ? "medium" : "low";

  return {
    projectDetection: {
      projectName: profile.projectName,
      productName: profile.productName,
      projectCategory: profile.projectCategory,
      evidence: profile.evidence,
      confidence
    },
    meaningfulFindings: profile.meaningfulFindings,
    prioritizedFindings: profile.prioritizedFindings,
    nextActions: profile.nextActions,
    attachmentInsights: {
      projectCategory: pickString(aiRaw.projectCategory),
      artifactType: pickString(aiRaw.artifactType),
      keyCharacteristics: pickStringList(aiRaw.keyCharacteristics, 12),
      versionChangeSummary: pickString(aiRaw.versionChangeSummary),
      confidence: normalizeConfidence(pickString(aiRaw.confidence)),
      limitations: pickStringList(aiRaw.limitations, 8)
    },
    deepInsights: deep,
    traceabilityMap: gov.traceabilityMap,
    executableConstraints: gov.executableConstraints,
    domainKnowledge: gov.domainKnowledge,
    versionDiffDetailed: gov.versionDiffDetailed,
    clarificationQuestions: pickStringList(parsed?.clarificationQuestions, 12),
    risks: pickStringList(parsed?.risks, 12),
    suggestions: pickStringList(parsed?.suggestions, 14)
  };
}

function listCoreAnalysisMissingReasons(result: CoreAnalysisChunkResult): string[] {
  const reasons: string[] = [];
  if (!result.projectDetection.projectName && !result.projectDetection.productName) {
    reasons.push("missing projectDetection.projectName/productName");
  }
  if (result.meaningfulFindings.length === 0) reasons.push("meaningfulFindings is empty");
  if (result.prioritizedFindings.length === 0) reasons.push("prioritizedFindings is empty");
  if (result.deepInsights.fileInsights.length === 0) reasons.push("deepInsights.fileInsights is empty");
  if (result.domainKnowledge.terms.length === 0) reasons.push("domainKnowledge.terms is empty");
  return reasons;
}

// ---------------------------------------------------------------------------
// 公共入口
// ---------------------------------------------------------------------------

export type CoreAnalysisParams = {
  iterationName: string;
  baselineIterationName: string;
  analyzedTarget: string;
  sourceType: "single-file" | "folder";
  excerpt: string;
  fileStats: { totalFiles: number; textFiles: number; binaryFiles: number };
  versionDiff: { added: string[]; changed: string[]; removed: string[] };
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  requirements: string[];
  components: string[];
  codePaths: string[];
  visionPayloads?: VisionPayload[];
};

export async function runCoreAnalysisAgent(
  agentRunner: AgentRunner | null,
  params: CoreAnalysisParams,
  chunkConfig: ChunkConfig
): Promise<CoreAnalysisChunkResult> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured.");
  }

  const isCompact = params.sourceType === "single-file";
  const imageDataUrls = (params.visionPayloads || []).map((v) => v.dataUrl).filter(Boolean);

  // 分片规划
  const plan = planChunks(
    params.excerpt,
    `target=${params.analyzedTarget};files=${params.fileStats.totalFiles};sourceType=${params.sourceType}`,
    chunkConfig.chunkBudget,
    chunkConfig.chunkOverlap
  );

  if (plan.chunkCount <= 1) {
    // 单片：直接调用
    return runSingleChunk(agentRunner, params, params.excerpt, undefined, imageDataUrls, isCompact, chunkConfig);
  }

  // 多片：并发调用 + 确定性合并
  const results: CoreAnalysisChunkResult[] = [];
  let failCount = 0;
  const batches = batchArray(plan.chunks, chunkConfig.chunkParallelism);

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map((chunk) =>
        runSingleChunk(
          agentRunner,
          params,
          chunk.text,
          { index: chunk.index, total: chunk.total, fileRange: chunk.fileRange, digest: plan.digest },
          imageDataUrls,
          isCompact,
          chunkConfig
        )
      )
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        failCount += 1;
        const log = (await import("../../shared/logger")).createLogger("core-analysis");
        log.warn("core analysis chunk failed", { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      }
    }
  }

  if (results.length === 0) {
    throw new (await import('../shared/agentRunner')).LlmInvocationError("all core analysis chunks failed");
  }
  if (failCount / plan.chunkCount > chunkConfig.chunkFailureThreshold) {
    const log = (await import("../../shared/logger")).createLogger("core-analysis");
    log.warn("core analysis chunk failure rate exceeded threshold", { failed: failCount, total: plan.chunkCount });
  }

  return mergeCoreAnalysisChunks(results);
}

// ---------------------------------------------------------------------------
// 单片执行（含 repair）
// ---------------------------------------------------------------------------

async function runSingleChunk(
  agentRunner: AgentRunner,
  params: CoreAnalysisParams,
  excerpt: string,
  chunkInfo: { index: number; total: number; fileRange: string; digest: string } | undefined,
  imageDataUrls: string[],
  isCompact: boolean,
  chunkConfig: ChunkConfig
): Promise<CoreAnalysisChunkResult> {
  const chunkLabel = chunkInfo ? `chunk-${chunkInfo.index + 1}-of-${chunkInfo.total}` : "single";
  const prompt: IterationAgentPrompt = {
    agentId: `agent-core-analysis-${chunkLabel}`,
    role: isCompact ? "requirements-analyst" : "orchestrator",
    scope: "attachment",
    goal: "输出项目识别、关键发现、文件洞察、治理追溯的完整分析",
    expectedOutput: "JSON（见 systemPrompt 中的 schema）",
    systemPrompt: buildCoreAnalysisSystemPrompt(isCompact),
    userPrompt: buildCoreAnalysisUserPrompt(params, excerpt, chunkInfo)
  };

  let selected = await runAnalysisPrompt(agentRunner, prompt, { imageDataUrls });
  let result = parseCoreAnalysisResponse(selected.content);
  let missing = listCoreAnalysisMissingReasons(result);

  for (let attempt = 1; attempt <= chunkConfig.chunkRepairAttempts && missing.length > 0; attempt += 1) {
    const repairPrompt: IterationAgentPrompt = {
      ...prompt,
      agentId: `agent-core-analysis-repair-${chunkLabel}-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出不满足必填字段约束。请只输出严格 JSON 并补齐缺失项。",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：\n${selected.content.slice(0, 3000)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    result = parseCoreAnalysisResponse(selected.content);
    missing = listCoreAnalysisMissingReasons(result);
  }

  if (missing.length > 0) {
    const log = (await import("../../shared/logger")).createLogger("core-analysis");
    log.warn("core analysis incomplete after repair", { chunk: chunkLabel, missing: missing.join(", ") });
  }

  return result;
}
