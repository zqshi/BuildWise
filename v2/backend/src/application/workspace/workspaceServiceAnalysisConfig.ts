import type { AgentRunOptions, AgentRunner } from "./agentRunner";
import type { IterationAgentPrompt } from "../../domain/workspace/types";
import { readPositiveInt, readStringList } from "./workspaceEnvParsers";

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
    systemPrompt: `${prompt.systemPrompt}${methodBlock}`,
    userPrompt: `${prompt.userPrompt}${methodBlock}`
  };
}

export async function runAnalysisPrompt(
  agentRunner: AgentRunner,
  prompt: IterationAgentPrompt,
  options?: AgentRunOptions
) {
  return agentRunner.run(withAnalysisMethodology(prompt), options);
}
