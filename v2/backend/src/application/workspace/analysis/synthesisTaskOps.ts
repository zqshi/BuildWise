import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  VisionPayload
} from '../../../domain/workspace/types';
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
import type { composeAttachmentExcerpt, FolderSelectionDecision } from './inputOps';
import {
  buildAttachmentInsightsPrompt,
  buildDeepInsightsFileManifest,
  buildDeepInsightsPrompt,
  buildExecutionPolicyPrompt,
  listAttachmentInsightsMissingReasons,
  parseAttachmentInsightsCandidate
} from './synthesisTaskPromptOps';

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
