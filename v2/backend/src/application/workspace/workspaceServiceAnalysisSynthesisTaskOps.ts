import { LlmUnavailableError, type AgentRunner } from "./agentRunner";
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  VisionPayload
} from "../../domain/workspace/types";
import { type buildIterationAgentPlan, buildAttachmentInsights } from "./workspaceSupport";
import { listAttachmentInsightsMissingReasons, parseAttachmentInsightsCandidate } from "./workspaceServiceAnalysisAttachmentInsightsOps";
import { executeAgentPlanPromptsOp, resolvePlanParallelismFromEnv } from "./workspaceServiceAnalysisAgentPlanOps";
import { listDeepInsightsMissingReasons, parseDeepInsightsCandidate } from "./workspaceServiceAnalysisDeepInsightsOps";
import { buildDeepInsightsFileManifest } from "./workspaceServiceAnalysisDeepInsightsPromptOps";
import {
  listExecutionPolicyMissingReasons,
  listFolderSelectionMissingReasons,
  parseExecutionPolicyCandidate,
  parseFolderSelectionCandidate,
  resolveExecutionPolicyHeuristically
} from "./workspaceServiceAnalysisPreflightOps";
import { runAnalysisPrompt } from "./workspaceServiceAnalysisConfig";
import type { composeAttachmentExcerpt } from "./workspaceServiceAnalysisInputOps";
import type { FolderSelectionDecision } from "./workspaceServiceAnalysisInputOps";

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
  const prompt = {
    agentId: "agent-execution-policy-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "决定本轮分析执行策略（是否降级、是否单Agent）",
    expectedOutput: "JSON: {degraded,reason,enforceSingleAgent,forceMultiAgent,promptBudgetRisk}",
    systemPrompt:
      "你是LLM编排策略器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释。根据上下文规模和信息质量判断执行策略。",
    userPrompt: [
      `iteration=${params.iterationName};file=${params.fileName};sourceType=${params.sourceType}`,
      `strategy=${params.excerptPayload.strategy};digest=${params.excerptPayload.digest}`,
      `fileStats=total:${params.excerptPayload.fileStats.totalFiles},text:${params.excerptPayload.fileStats.textFiles},binary:${params.excerptPayload.fileStats.binaryFiles}`,
      `fileSelection=considered:${params.excerptPayload.fileSelection.consideredFiles},included:${params.excerptPayload.fileSelection.includedFiles},sampled:${params.excerptPayload.fileSelection.sampled ? "yes" : "no"}`,
      `excerptLength=${params.excerptPayload.text.length};chunkCount=${params.chunkCount}`,
      `forceMultiAgentHint=${params.forceMultiAgentHint ? "yes" : "no"}`,
      `textPreview=${params.excerptPayload.text.slice(0, 1800) || "-"}`,
      "输出要求：",
      "1) degraded: true/false",
      "2) reason: 简要原因",
      "3) enforceSingleAgent: true/false",
      "4) forceMultiAgent: true/false",
      "5) promptBudgetRisk: low/medium/high"
    ].join("\n\n")
  };
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
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 1600)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseExecutionPolicyCandidate(selected.content);
    missing = listExecutionPolicyMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("exec-policy");
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
      return `[${index + 1}] path=${path};mime=${mime};size=${size};excerpt=${excerpt || "[empty]"}`;
    })
    .join("\n");
  const prompt = {
    agentId: "agent-folder-selection-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "选择本轮分析应纳入的文件",
    expectedOutput: "JSON: {includedPaths:[], ignoredFiles:[{path,reason}], sampleReason}",
    systemPrompt:
      "你是分析上下文策展器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。基于业务价值、可解析性和版本相关性选择文件。",
    userPrompt: [
      `folder=${input.folderName || input.fileName || "folder"}`,
      `totalFiles=${files.length}`,
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
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2000)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseFolderSelectionCandidate(selected.content);
    missing = listFolderSelectionMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("folder-select");
    log.warn("folder selection incomplete", { missing: missing.join(", ") });
  }
  return candidate;
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
  const prompt = {
    agentId: "agent-deep-insights-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "生成逐文件深度洞察与跨文件综合洞察",
    expectedOutput:
      "JSON: {coverage:{consideredFiles,analyzedFiles,partialFiles,failedFiles,coveragePercent}, fileInsights:[{path,fileName,mimeType,size,kind,status,mainContent,requiredWork,iterationValue,summary,keyPoints,risks,optimizeItems,keepItems,recommendedActions,openQuestions,citations,confidence}], crossFileInsights:{themes,conflicts,gaps,recommendations,conflictChains,rootCauses,impactScope,decisionSuggestions}}",
    systemPrompt:
      "你是资深需求分析师。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文字。逐文件洞察必须基于输入文件内容，不得虚构。",
    userPrompt: [
      `sourceType=${params.input.sourceType === "folder" ? "folder" : "single-file"};target=${params.input.fileName}`,
      `digest=${params.excerptPayload.digest}`,
      `prioritizedFindings=${params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`).join(" | ") || "-"}`,
      `clarificationQuestions=${params.clarificationQuestions.join(" | ") || "-"}`,
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
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseDeepInsightsCandidate(selected.content);
    missing = listDeepInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("deep-insights");
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
  const insightsRole: "requirements-analyst" | "orchestrator" = compactSingleFile ? "requirements-analyst" : "orchestrator";
  const prompt = {
    agentId: compactSingleFile ? "agent-attachment-insights-compact-1" : "agent-attachment-insights-1",
    role: insightsRole,
    scope: "attachment" as const,
    goal: "输出附件洞察摘要",
    expectedOutput: "JSON: {projectCategory,artifactType,keyCharacteristics[],versionChangeSummary,confidence,limitations[]}",
    systemPrompt:
      "你是产品分析专家。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。confidence 只能是 high/medium/low。",
    userPrompt: [
      `iteration=${params.iterationName};file=${params.fileName};sourceType=${params.sourceType}`,
      `diff=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${params.versionDiff.removed.join(" | ") || "-"}`,
      `diffLocations=${params.diffLocations.map((item) => `${item.dimension}/${item.changeType}:${item.baselineItem || "-"}->${item.currentItem}`).join(" | ") || "-"}`,
      `excerpt=${params.excerpt.slice(0, compactSingleFile ? 1400 : 2600) || "-"}`,
      compactSingleFile
        ? "输出要求：projectCategory、artifactType、keyCharacteristics(1-4)、versionChangeSummary、confidence、limitations(0-3)。"
        : "输出要求：projectCategory、artifactType、keyCharacteristics(1-8)、versionChangeSummary、confidence、limitations(0-8)。"
    ].join("\n\n")
  };
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
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 2200)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    candidate = parseAttachmentInsightsCandidate(selected.content);
    missing = listAttachmentInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../shared/logger")).createLogger("attach-insights");
    log.warn("attachment insights incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}
