import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  VisionPayload
} from '../../../domain/workspace/types';
import { formatDiffLocations, formatFileStats, formatPrioritizedFindings, formatSourceType, formatVersionDiff, normalizeConfidence, parseJsonObjectFromText, pickString, pickStringList } from './extractors';
import { type buildIterationAgentPlan, buildAttachmentInsights } from '../shared/workspaceSupport';
import { executeAgentPlanPromptsOp, resolvePlanParallelismFromEnv } from './agentPlanOps';
import { listDeepInsightsMissingReasons, parseDeepInsightsCandidate } from './deepInsightsOps';
import {
  listExecutionPolicyMissingReasons,
  listFolderSelectionMissingReasons,
  parseExecutionPolicyCandidate,
  parseFolderSelectionCandidate,
  resolveExecutionPolicyHeuristically
} from './preflightOps';
import { runAnalysisPrompt } from './configOps';

// ── Inlined from workspaceServiceAnalysisAttachmentInsightsOps.ts ──

function parseAttachmentInsightsCandidate(content: string) {
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

function listAttachmentInsightsMissingReasons(candidate: ReturnType<typeof parseAttachmentInsightsCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectCategory) reasons.push("项目类别缺失");
  if (!candidate.artifactType) reasons.push("交付物类型缺失");
  if (candidate.keyCharacteristics.length === 0) reasons.push("关键特征为空");
  if (!candidate.versionChangeSummary) reasons.push("版本变更摘要缺失");
  return reasons;
}

// ── Inlined from workspaceServiceAnalysisDeepInsightsPromptOps.ts ──

function buildDeepInsightsFileManifest(input: AttachmentUploadInput) {
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
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import type { composeAttachmentExcerpt } from './inputOps';
import type { FolderSelectionDecision } from './inputOps';

function buildExecutionPolicyPrompt(params: {
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

export async function synthesizeExecutionPolicyOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    fileName: string;
    sourceType: "single-file" | "folder";
    excerptPayload: ReturnType<typeof composeAttachmentExcerpt>;
    chunkCount: number;
    forceMultiAgentHint?: boolean;
  }
) {
  const heuristic = resolveExecutionPolicyHeuristically({
    sourceType: params.sourceType,
    excerptLength: params.excerptPayload.text.length,
    chunkCount: params.chunkCount,
    totalFiles: params.excerptPayload.fileStats.totalFiles,
    binaryFiles: params.excerptPayload.fileStats.binaryFiles,
    forceMultiAgentHint: params.forceMultiAgentHint
  });
  if (heuristic) {
    return heuristic;
  }
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const prompt = buildExecutionPolicyPrompt(params);
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseExecutionPolicyCandidate(selected.content);
  let missing = listExecutionPolicyMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-execution-policy-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并修复以下问题：",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 1600)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseExecutionPolicyCandidate(selected.content);
    missing = listExecutionPolicyMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("exec-policy");
    log.warn("execution policy incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}

export async function synthesizeFolderSelectionOp(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput
): Promise<FolderSelectionDecision> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const files = Array.isArray(input.files) ? input.files : [];
  const manifest = files
    .slice(0, 600)
    .map((item, index) => {
      const path = (item.path || item.fileName || "").trim();
      const mime = (item.mimeType || "application/octet-stream").trim();
      const size = Number.isFinite(item.size) ? item.size : 0;
      const excerpt = (item.excerpt || "").trim().slice(0, 200);
      return `[${index + 1}] 路径：${path}；类型：${mime}；大小：${size} 字节；摘要：${excerpt || "（空）"}`;
    })
    .join("\n");
  const prompt = {
    agentId: "agent-folder-selection-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "选择本轮分析应纳入的文件",
    expectedOutput: "JSON: {includedPaths:[], ignoredFiles:[{path,reason}], sampleReason}",
    systemPrompt:
      "你是分析上下文策展器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。基于业务价值、可解析性和版本相关性选择文件。所有 string 类型字段的值（如 reason、sampleReason）必须使用中文业务语言，路径字段除外。",
    userPrompt: [
      `文件夹名称：${input.folderName || input.fileName || "folder"}`,
      `文件总数：${files.length}`,
      "请从以下文件清单中选出应纳入本轮分析的文件路径 includedPaths。",
      "忽略的文件请写入 ignoredFiles，并给出 reason。",
      "file manifest:",
      manifest
    ].join("\n\n")
  };
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseFolderSelectionCandidate(selected.content);
  let missing = listFolderSelectionMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-folder-selection-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出缺少必填项，请仅输出严格 JSON。",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2000)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseFolderSelectionCandidate(selected.content);
    missing = listFolderSelectionMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("folder-select");
    log.warn("folder selection incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}


function buildDeepInsightsPrompt(
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

export async function synthesizeDeepInsightsOp(
  agentRunner: AgentRunner | null,
  params: {
    input: AttachmentUploadInput;
    excerptPayload: ReturnType<typeof composeAttachmentExcerpt>;
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    clarificationQuestions: string[];
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const fileManifest = buildDeepInsightsFileManifest(params.input);
  const prompt = buildDeepInsightsPrompt(params, fileManifest);
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseDeepInsightsCandidate(selected.content);
  let missing = listDeepInsightsMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-deep-insights-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出未满足必填字段，请仅输出严格 JSON 并补齐：",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseDeepInsightsCandidate(selected.content);
    missing = listDeepInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("deep-insights");
    log.warn("deep insights incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}


export async function executeAgentPlanOp(
  agentRunner: AgentRunner | null,
  prompts: ReturnType<typeof buildIterationAgentPlan>["prompts"],
  visionPayloads: VisionPayload[]
): Promise<IterationAgentOutput[]> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const parallelism = resolvePlanParallelismFromEnv(processEnv);
  return executeAgentPlanPromptsOp({
    prompts,
    parallelism,
    imageDataUrls: visionPayloads.map((item) => item.dataUrl),
    runPrompt: (prompt, options) => runAnalysisPrompt(agentRunner, prompt, options)
  });
}


function buildAttachmentInsightsPrompt(
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

export async function synthesizeAttachmentInsightsOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    fileName: string;
    sourceType: "single-file" | "folder";
    excerpt: string;
    versionDiff: { added: string[]; changed: string[]; removed: string[] };
    diffLocations: AttachmentAnalysisReport["diffLocations"];
    visionPayloads?: VisionPayload[];
  }
) {
  const compactSingleFile = params.sourceType === "single-file";
  const shouldUseHeuristicInsights = compactSingleFile && (!params.visionPayloads || params.visionPayloads.length === 0);
  if (shouldUseHeuristicInsights) {
    return buildAttachmentInsights({
      fileName: params.fileName,
      mimeType: "text/markdown",
      excerpt: params.excerpt,
      strategy: params.excerpt.trim() ? "direct" : "binary-no-text",
      iterationName: params.iterationName,
      diffLocations: params.diffLocations,
      added: params.versionDiff.added,
      changed: params.versionDiff.changed,
      removed: params.versionDiff.removed
    });
  }
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const prompt = buildAttachmentInsightsPrompt(params, compactSingleFile);
  const imageDataUrls = (params.visionPayloads || []).map((item) => item.dataUrl).filter(Boolean);
  let selected = await runAnalysisPrompt(agentRunner, prompt, { imageDataUrls });
  let candidate = parseAttachmentInsightsCandidate(selected.content);
  let missing = listAttachmentInsightsMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-attachment-insights-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并补齐以下缺失项：",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 2200)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    candidate = parseAttachmentInsightsCandidate(selected.content);
    missing = listAttachmentInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("attach-insights");
    log.warn("attachment insights incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}
