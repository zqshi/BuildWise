/**
 * preflightAgentOps — 合并版 Preflight Agent
 *
 * 合并旧 Agent：
 * - agent-folder-selection（从文件清单选出分析文件）
 * - agent-execution-policy（决定执行策略）
 *
 * 一次 LLM 调用输出：includedPaths + ignoredFiles + executionStrategy
 * 当文件清单超过 200 条时，manifest 分批发送。
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { AttachmentUploadInput, IterationAgentPrompt } from '../../../domain/workspace/types';
import { parseJsonObjectFromText, pickString, pickStringList } from './extractors';
import { resolveExecutionPolicyHeuristically } from './preflightOps';
import { batchArray } from './chunkingOps';
import { runAnalysisPrompt } from './configOps';
import type { FolderSelectionDecision } from './inputOps';

export type PreflightResult = {
  folderSelection: FolderSelectionDecision;
  executionPolicy: {
    degraded: boolean;
    reason: string;
    enforceSingleAgent: boolean;
    forceMultiAgent: boolean;
    promptBudgetRisk: "low" | "medium" | "high";
  };
};

function parsePreflightCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const includedPaths = pickStringList(parsed?.includedPaths, 800);
  const ignoredFiles = Array.isArray(parsed?.ignoredFiles)
    ? (parsed.ignoredFiles as Array<Record<string, unknown>>)
        .map((item) => ({ path: pickString(item.path), reason: pickString(item.reason) }))
        .filter((item) => item.path.length > 0)
        .slice(0, 400)
    : [];
  const sampleReason = pickString(parsed?.sampleReason);

  const strategyRaw = (parsed?.executionStrategy ?? {}) as Record<string, unknown>;
  const riskRaw = pickString(strategyRaw.promptBudgetRisk).toLowerCase();
  const promptBudgetRisk: "low" | "medium" | "high" =
    riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : "medium";

  return {
    includedPaths,
    ignoredFiles,
    sampleReason,
    executionStrategy: {
      degraded: Boolean(strategyRaw.degraded ?? parsed?.degraded),
      reason: pickString(strategyRaw.reason ?? parsed?.reason),
      enforceSingleAgent: Boolean(strategyRaw.enforceSingleAgent ?? parsed?.enforceSingleAgent),
      forceMultiAgent: Boolean(strategyRaw.forceMultiAgent ?? parsed?.forceMultiAgent),
      promptBudgetRisk
    }
  };
}

function listPreflightMissingReasons(candidate: ReturnType<typeof parsePreflightCandidate>) {
  const reasons: string[] = [];
  if (candidate.includedPaths.length === 0) reasons.push("已选文件路径为空");
  if (!candidate.executionStrategy.reason) reasons.push("执行策略原因缺失");
  return reasons;
}

const MANIFEST_BATCH_SIZE = 200;

export async function runPreflightAgent(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput,
  excerptLength: number,
  chunkCount: number
): Promise<PreflightResult> {
  const files = Array.isArray(input.files) ? input.files : [];
  const isSingleFile = input.sourceType !== "folder" || files.length <= 1;

  // 单文件：启发式即可，不需要 LLM
  if (isSingleFile) {
    const heuristic = resolveExecutionPolicyHeuristically({
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      excerptLength,
      chunkCount,
      totalFiles: files.length || 1,
      binaryFiles: 0,
      forceMultiAgentHint: input.forceMultiAgent
    });
    return {
      folderSelection: {
        includedPaths: [input.fileName || "attachment"],
        ignoredFiles: [],
        sampleReason: ""
      },
      executionPolicy: heuristic || {
        degraded: false,
        reason: "单文件默认策略",
        enforceSingleAgent: true,
        forceMultiAgent: false,
        promptBudgetRisk: "low"
      }
    };
  }

  // 文件夹：需要 LLM 选择文件 + 决定策略
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured.");
  }

  // 分批构建 manifest
  const manifestBatches = batchArray(files.slice(0, 600), MANIFEST_BATCH_SIZE) as FileEntry[][];

  if (manifestBatches.length <= 1) {
    // 单批直接调用
    return runPreflightSingleBatch(agentRunner, input, files as FileEntry[], excerptLength, chunkCount);
  }

  // 多批：逐批调用后合并 includedPaths / ignoredFiles
  let allIncluded: string[] = [];
  let allIgnored: Array<{ path: string; reason: string }> = [];
  let lastPolicy: PreflightResult["executionPolicy"] = { degraded: false, reason: "", enforceSingleAgent: false, forceMultiAgent: false, promptBudgetRisk: "medium" };

  for (let i = 0; i < manifestBatches.length; i++) {
    const batchFiles = manifestBatches[i];
    const result = await runPreflightSingleBatch(agentRunner, input, batchFiles, excerptLength, chunkCount, i + 1, manifestBatches.length);
    allIncluded = [...allIncluded, ...result.folderSelection.includedPaths];
    allIgnored = [...allIgnored, ...result.folderSelection.ignoredFiles];
    lastPolicy = result.executionPolicy;
  }

  return {
    folderSelection: {
      includedPaths: Array.from(new Set(allIncluded)),
      ignoredFiles: Array.from(new Map(allIgnored.map((i) => [i.path, i])).values()),
      sampleReason: allIncluded.length < files.length ? "llm-file-selection" : ""
    },
    executionPolicy: lastPolicy
  };
}

type FileEntry = { path: string; fileName: string; mimeType: string; size: number; excerpt: string; imageDataUrl?: string };

async function runPreflightSingleBatch(
  agentRunner: AgentRunner,
  input: AttachmentUploadInput,
  batchFiles: FileEntry[],
  excerptLength: number,
  chunkCount: number,
  batchIndex = 1,
  batchTotal = 1
): Promise<PreflightResult> {
  const manifest = batchFiles
    .map((item, i) => {
      const path = (item.path || item.fileName || "").trim();
      const mime = (item.mimeType || "").trim();
      const excerpt = (item.excerpt || "").trim().slice(0, 200);
      return `[${i + 1}] 路径：${path}；类型：${mime}；摘要：${excerpt || "（空）"}`;
    })
    .join("\n");

  const batchLabel = batchTotal > 1 ? `（批次 ${batchIndex}/${batchTotal}）` : "";
  const prompt: IterationAgentPrompt = {
    agentId: `agent-preflight-${batchIndex}`,
    role: "orchestrator",
    scope: "attachment",
    goal: "选择分析文件并决定执行策略",
    expectedOutput: "JSON: {includedPaths[], ignoredFiles:[{path,reason}], sampleReason, executionStrategy:{degraded,reason,enforceSingleAgent,forceMultiAgent,promptBudgetRisk}}",
    systemPrompt: [
      "你是分析上下文策展器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。",
      "基于业务价值、可解析性和版本相关性选择文件，同时评估执行策略。",
      "所有 string 类型字段的值（如 reason、sampleReason）必须使用中文业务语言，禁止出现：文件大小、英文技术缩写、前端后端框架名称。路径字段除外。"
    ].join("\n"),
    userPrompt: [
      `文件夹名称：${input.folderName || input.fileName || "folder"}${batchLabel}`,
      `文件总数：${(input.files || []).length}；本批文件数：${batchFiles.length}`,
      `摘要长度：${excerptLength}；分片数量：${chunkCount}`,
      "请从以下文件清单中选出应纳入本轮分析的文件路径 includedPaths。",
      "忽略的文件写入 ignoredFiles（含 reason）。",
      "同时在 executionStrategy 中给出 degraded/reason/enforceSingleAgent/forceMultiAgent/promptBudgetRisk。",
      `file manifest:\n${manifest}`
    ].join("\n\n")
  };

  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parsePreflightCandidate(selected.content);
  let missing = listPreflightMissingReasons(candidate);

  for (let attempt = 1; attempt <= 1 && missing.length > 0; attempt++) {
    const repairPrompt: IterationAgentPrompt = {
      ...prompt,
      agentId: `agent-preflight-repair-${batchIndex}-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并补齐以下缺失项：",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 2000)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parsePreflightCandidate(selected.content);
    missing = listPreflightMissingReasons(candidate);
  }

  return {
    folderSelection: {
      includedPaths: candidate.includedPaths,
      ignoredFiles: candidate.ignoredFiles,
      sampleReason: candidate.sampleReason
    },
    executionPolicy: candidate.executionStrategy
  };
}
