import type { AgentRunOptions, AgentRunner } from '../shared/agentRunner';
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import { readPositiveInt, readStringList } from '../shared/envParsers';

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const v = (value || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

export type ContextGuardrails = {
  maxExcerptLength: number;
  maxChunkCount: number;
  maxPromptBudget: number;
  unknownSignalThreshold: number;
  maxFolderFiles: number;
  maxFolderManifestFiles: number;
  maxFolderExcerptFiles: number;
};

export type SynthesisLlmConfig = {
  fallbackModels: string[];
  repairAttemptsSingleFile: number;
  repairAttemptsBatch: number;
  findingsRepairAttempts: number;
  projectDetectionRepairAttempts: number;
};

function loadContextGuardrailsFromEnv(): ContextGuardrails {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return {
    maxExcerptLength: readPositiveInt(processEnv.LLM_MAX_EXCERPT_LENGTH, 9000),
    maxChunkCount: readPositiveInt(processEnv.LLM_MAX_CHUNK_COUNT, 6),
    maxPromptBudget: readPositiveInt(processEnv.LLM_MAX_PROMPT_BUDGET, 24000),
    unknownSignalThreshold: readPositiveInt(processEnv.LLM_UNKNOWN_SIGNAL_THRESHOLD, 2),
    maxFolderFiles: readPositiveInt(processEnv.LLM_FOLDER_MAX_FILES, 120),
    maxFolderManifestFiles: readPositiveInt(processEnv.LLM_FOLDER_MANIFEST_MAX_FILES, 60),
    maxFolderExcerptFiles: readPositiveInt(processEnv.LLM_FOLDER_EXCERPT_MAX_FILES, 20)
  };
}

function loadSynthesisLlmConfigFromEnv(): SynthesisLlmConfig {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const explicitFallbackModels = readStringList(processEnv.LLM_SYNTHESIS_FALLBACK_MODELS);
  const sharedFallbackModels = readStringList(processEnv.LLM_FALLBACK_MODELS);
  const fallbackModels = explicitFallbackModels.length > 0 ? explicitFallbackModels : sharedFallbackModels;
  return {
    fallbackModels,
    repairAttemptsSingleFile: readPositiveInt(processEnv.LLM_SYNTHESIS_REPAIR_ATTEMPTS_SINGLE, 2),
    repairAttemptsBatch: readPositiveInt(processEnv.LLM_SYNTHESIS_REPAIR_ATTEMPTS_BATCH, 4),
    findingsRepairAttempts: readPositiveInt(processEnv.LLM_SYNTHESIS_FINDINGS_REPAIR_ATTEMPTS, 3),
    projectDetectionRepairAttempts: readPositiveInt(processEnv.LLM_SYNTHESIS_PROJECT_REPAIR_ATTEMPTS, 3)
  };
}

export const CONTEXT_GUARDRAILS = loadContextGuardrailsFromEnv();
export const SYNTHESIS_LLM_CONFIG = loadSynthesisLlmConfigFromEnv();

// ---------------------------------------------------------------------------
// 分片配置 + Feature Flag
// ---------------------------------------------------------------------------

export type ChunkConfig = {
  /** 每片最大字符数（promptBudget - 模板预留） */
  chunkBudget: number;
  /** 硬切时的重叠字符数 */
  chunkOverlap: number;
  /** 分片并发上限 */
  chunkParallelism: number;
  /** 单片 repair 次数上限 */
  chunkRepairAttempts: number;
  /** 超过此比例的片失败则整体报错 */
  chunkFailureThreshold: number;
};

function loadChunkConfigFromEnv(): ChunkConfig {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return {
    chunkBudget: readPositiveInt(processEnv.BW_CHUNK_BUDGET, 21000),
    chunkOverlap: readPositiveInt(processEnv.BW_CHUNK_OVERLAP, 500),
    chunkParallelism: readPositiveInt(processEnv.BW_CHUNK_PARALLELISM, 3),
    chunkRepairAttempts: readPositiveInt(processEnv.BW_CHUNK_REPAIR_ATTEMPTS, 1),
    chunkFailureThreshold: Number.parseFloat(processEnv.BW_CHUNK_FAILURE_THRESHOLD || "0.5") || 0.5
  };
}

export const CHUNK_CONFIG = loadChunkConfigFromEnv();

/** true → 走新的 3+1 Agent 整合管道；false → 走现有 14-Agent 管道 */
export const USE_CONSOLIDATED_AGENTS: boolean = readBoolean(
  ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}).BW_CONSOLIDATED_AGENTS,
  false
);

const ANALYSIS_METHOD_GUIDELINE = [
  "分析方法要求（必须遵守）：",
  "1) 5W1H澄清：说明对象、目标、边界、约束、时序与责任主体。",
  "2) MECE分解：将结论拆成互斥且完整的结构，不得重复堆砌。",
  "3) 证据链：每个关键结论至少给出一个附件证据或路径证据。",
  "4) 风险与反证：识别假设、风险、未知项，并给出验证动作。",
  "5) 可执行输出：结论必须可直接用于任务拆解、开发、测试或发布决策。"
].join("\n");

function withAnalysisMethodology(prompt: IterationAgentPrompt): IterationAgentPrompt {
  const methodBlock = `\n\n${ANALYSIS_METHOD_GUIDELINE}`;
  return {
    ...prompt,
    systemPrompt: `${prompt.systemPrompt}${methodBlock}`
  };
}

export async function runAnalysisPrompt(
  agentRunner: AgentRunner,
  prompt: IterationAgentPrompt,
  options?: AgentRunOptions
) {
  return agentRunner.run(withAnalysisMethodology(prompt), options);
}
