/**
 * synthesisTaskPromptOps — 合成任务 prompt 构建与解析辅助
 *
 * 从 synthesisTaskOps 拆出的非导出辅助函数：
 * - 附件洞察候选解析与缺失项校验
 * - 深度洞察文件清单构建
 * - 执行策略 / 深度洞察 / 附件洞察的 prompt 构建
 *
 * 纯函数，无 LLM 与 IO 依赖（仅构建 prompt 与解析 JSON 候选）。
 */
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentPrompt
} from '../../../domain/workspace/types';
import type { composeAttachmentExcerpt } from './inputOps';
import {
  formatDiffLocations,
  formatFileStats,
  formatPrioritizedFindings,
  formatSourceType,
  formatVersionDiff,
  normalizeConfidence,
  parseJsonObjectFromText,
  pickString,
  pickStringList
} from './extractors';

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
  if (!candidate.projectCategory) reasons.push("项目类别缺失");
  if (!candidate.artifactType) reasons.push("交付物类型缺失");
  if (candidate.keyCharacteristics.length === 0) reasons.push("关键特征为空");
  if (!candidate.versionChangeSummary) reasons.push("版本变更摘要缺失");
  return reasons;
}

export function buildDeepInsightsFileManifest(input: AttachmentUploadInput) {
  const sourceFiles =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? input.files.slice(0, 300)
      : [
          {
            path: input.fileName || "attachment",
            fileName: input.fileName || "attachment",
            mimeType: input.mimeType || "application/octet-stream",
            size: input.size || 0,
            excerpt: input.excerpt || ""
          }
        ];
  const manifest = sourceFiles
    .map((item, index) => {
      const path = (item.path || item.fileName || "").trim() || `file-${index + 1}`;
      const fileName = (item.fileName || path.split("/").pop() || path).trim();
      const mimeType = (item.mimeType || "application/octet-stream").trim();
      const excerpt = (item.excerpt || "").trim().slice(0, 800);
      return `[${index + 1}] 路径：${path}；文件名：${fileName}；类型：${mimeType}\n摘要：${excerpt || "（空）"}`;
    })
    .join("\n\n---\n\n");
  return manifest.length > 12000 ? `${manifest.slice(0, 12000)}\n…（还有文件未列出，共 ${sourceFiles.length} 个）` : manifest;
}

export function buildExecutionPolicyPrompt(params: {
  iterationName: string;
  fileName: string;
  sourceType: "single-file" | "folder";
  excerptPayload: ReturnType<typeof composeAttachmentExcerpt>;
  chunkCount: number;
  forceMultiAgentHint?: boolean;
}): IterationAgentPrompt {
  return {
    agentId: "agent-execution-policy-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "决定本轮分析执行策略（是否降级、是否单Agent）",
    expectedOutput: "JSON: {degraded,reason,enforceSingleAgent,forceMultiAgent,promptBudgetRisk}",
    systemPrompt:
      "你是LLM编排策略器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释。根据上下文规模和信息质量判断执行策略。所有 string 类型字段的值（如 reason）必须使用中文业务语言。",
    userPrompt: [
      `所属迭代：${params.iterationName}`,
      `文件名称：${params.fileName}`,
      `来源类型：${formatSourceType(params.sourceType)}`,
      `摘要策略：${params.excerptPayload.strategy}`,
      `内容概要：${params.excerptPayload.digest}`,
      formatFileStats(params.excerptPayload.fileStats),
      `文件选择：已考虑 ${params.excerptPayload.fileSelection.consideredFiles} 个，已纳入 ${params.excerptPayload.fileSelection.includedFiles} 个，${params.excerptPayload.fileSelection.sampled ? "已抽样" : "未抽样"}`,
      `摘要长度：${params.excerptPayload.text.length} 字符；分片数量：${params.chunkCount}`,
      `强制多Agent提示：${params.forceMultiAgentHint ? "是" : "否"}`,
      `文本预览：${params.excerptPayload.text.slice(0, 1800) || "无"}`,
      "输出要求：",
      "1) degraded: true/false",
      "2) reason: 简要原因",
      "3) enforceSingleAgent: true/false",
      "4) forceMultiAgent: true/false",
      "5) promptBudgetRisk: low/medium/high"
    ].join("\n\n")
  };
}

export function buildDeepInsightsPrompt(
  params: { input: AttachmentUploadInput; excerptPayload: ReturnType<typeof composeAttachmentExcerpt>; prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"]; clarificationQuestions: string[] },
  fileManifest: string
): IterationAgentPrompt {
  return {
    agentId: "agent-deep-insights-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "生成逐文件深度洞察与跨文件综合洞察",
    expectedOutput:
      "JSON: {coverage:{consideredFiles,analyzedFiles,partialFiles,failedFiles,coveragePercent}, fileInsights:[{path,fileName,mimeType,size,kind,status,mainContent,requiredWork,iterationValue,summary,keyPoints,risks,optimizeItems,keepItems,recommendedActions,openQuestions,citations,confidence}], crossFileInsights:{themes,conflicts,gaps,recommendations,conflictChains,rootCauses,impactScope,decisionSuggestions}}",
    systemPrompt:
      "你是资深需求分析师。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文字。逐文件洞察必须基于输入文件内容，不得虚构。所有 string 类型字段的值必须使用中文业务语言，禁止出现：文件大小、英文技术缩写、前端后端框架名称。路径字段除外。",
    userPrompt: [
      `来源类型：${formatSourceType(params.input.sourceType === "folder" ? "folder" : "single-file")}；分析目标：${params.input.fileName}`,
      `内容概要：${params.excerptPayload.digest}`,
      formatPrioritizedFindings(params.prioritizedFindings),
      `澄清问题：${params.clarificationQuestions.join("；") || "无"}`,
      `files:\n${fileManifest}`,
      "输出要求：",
      "1) fileInsights 必须覆盖输入文件（可对信息不足文件给 partial/failed）。",
      "2) kind 仅允许 document/code/image/prototype/binary。",
      "3) status 仅允许 analyzed/partial/failed。",
      "4) confidence 仅允许 high/medium/low。",
      "5) 每个文件必须回答：mainContent(文件主要内容)、requiredWork(要做什么)、iterationValue(对当前迭代为何必要)。",
      "6) 每个文件给出 summary/keyPoints/risks/optimizeItems/keepItems/recommendedActions/openQuestions/citations。",
      "7) 如果是 HTML/原型，必须描述关键交互形态与状态变化。",
      "8) optimizeItems 必须是需优化内容，keepItems 必须是应保持内容。",
      "9) crossFileInsights 必须给出 themes/conflicts/gaps/recommendations/conflictChains/rootCauses/impactScope/decisionSuggestions。"
    ].join("\n\n")
  };
}

export function buildAttachmentInsightsPrompt(
  params: { iterationName: string; fileName: string; sourceType: "single-file" | "folder"; excerpt: string; versionDiff: { added: string[]; changed: string[]; removed: string[] }; diffLocations: AttachmentAnalysisReport["diffLocations"] },
  compactSingleFile: boolean
): IterationAgentPrompt {
  const insightsRole: "requirements-analyst" | "orchestrator" = compactSingleFile ? "requirements-analyst" : "orchestrator";
  return {
    agentId: compactSingleFile ? "agent-attachment-insights-compact-1" : "agent-attachment-insights-1",
    role: insightsRole,
    scope: "attachment" as const,
    goal: "输出附件洞察摘要",
    expectedOutput: "JSON: {projectCategory,artifactType,keyCharacteristics[],versionChangeSummary,confidence,limitations[]}",
    systemPrompt:
      "你是产品分析专家。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。confidence 只能是 high/medium/low。所有 string 类型字段的值必须使用中文业务语言。",
    userPrompt: [
      `所属迭代：${params.iterationName}；文件名称：${params.fileName}；来源类型：${formatSourceType(params.sourceType)}`,
      formatVersionDiff(params.versionDiff),
      formatDiffLocations(params.diffLocations),
      `附件节选：${params.excerpt.slice(0, compactSingleFile ? 1400 : 2600) || "无"}`,
      compactSingleFile
        ? "输出要求：projectCategory、artifactType、keyCharacteristics(1-4)、versionChangeSummary、confidence、limitations(0-3)。"
        : "输出要求：projectCategory、artifactType、keyCharacteristics(1-8)、versionChangeSummary、confidence、limitations(0-8)。"
    ].join("\n\n")
  };
}
