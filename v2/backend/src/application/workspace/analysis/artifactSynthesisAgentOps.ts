/**
 * artifactSynthesisAgentOps — LLM 驱动的交付物合成（本体 + re-export 桥接）
 *
 * 核心原则：
 * - 所有交付物内容 100% 由 LLM 生成，无硬编码模板
 * - 每个 artifact 有专属 prompt，包含行业最佳实践结构要求
 * - LLM 评估信息充分度，不足的部分生成澄清问题
 * - agentRunner 不可用时直接报错，不降级
 *
 * 子模块（按职责拆分，单向依赖，无循环）：
 * - artifactSynthesisSerializer: ChangeControl → 文本序列化（serializeAvailableData）
 * - artifactPromptConfigs: 各 artifact 的 prompt 配置表（ARTIFACT_PROMPTS/SKIP_LLM_SYNTHESIS）
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { Iteration } from '../../../domain/workspace/types';
import type { defaultIterationChangeControl } from '../shared/common';
import { runAnalysisPrompt } from './configOps';
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import { batchArray } from './chunkingOps';
import { createLogger } from '../../../infrastructure/runtime/logger';
import { serializeAvailableData } from './artifactSynthesisSerializer';
import { ARTIFACT_PROMPTS, SKIP_LLM_SYNTHESIS } from './artifactPromptConfigs';

// re-export 供既有调用方继续从本文件 import（兼容层）
export { serializeAvailableData } from './artifactSynthesisSerializer';
export { ARTIFACT_PROMPTS, SKIP_LLM_SYNTHESIS } from './artifactPromptConfigs';
export type { ArtifactPromptConfig } from './artifactPromptConfigs';

const log = createLogger("artifact-synthesis");

type ChangeControl = ReturnType<typeof defaultIterationChangeControl>;

// ── 单个 artifact 合成 ──

async function synthesizeSingleArtifact(
  agentRunner: AgentRunner,
  artifactId: string,
  iteration: Iteration,
  _cc: ChangeControl,
  availableData: string
): Promise<{ content: string; clarifications: string[] }> {
  const config = ARTIFACT_PROMPTS[artifactId];
  if (!config) return { content: "", clarifications: [] };

  const prompt: IterationAgentPrompt = {
    agentId: `agent-artifact-${artifactId}`,
    role: "orchestrator",
    scope: "iteration",
    goal: `生成高质量的${config.documentType}`,
    expectedOutput: "markdown 文档 + 末尾 JSON clarifications",
    systemPrompt: [
      `你是${config.role}。请基于以下结构化分析数据，按照行业最佳实践输出一份高质量的${config.documentType}。`,
      "",
      "输出规则：",
      "- 格式：markdown，使用中文",
      "- 所有内容必须基于提供的分析数据，不要虚构或编造",
      "- 数据充分的章节：输出高质量、有实际参考价值的专业内容",
      "- 数据不足的章节：不要输出任何占位符、「待补充」或空章节，直接省略该章节",
      "- 你的输出将直接作为交付物呈现给用户，必须具有实际指导价值",
      "- 禁止出现内部字段名、JSON 路径、技术变量名等系统内部信息",
      "",
      `${config.bestPractice}`,
      "",
      "输出格式要求：",
      "1. 先输出完整的 markdown 文档",
      "2. 文档末尾另起一行，输出一个 JSON 对象（不要用 ```json 包裹）：",
      '{"clarifications": ["需要用户补充的具体信息1", "需要用户补充的具体信息2"]}',
      "如果所有信息都充足，输出空数组：{\"clarifications\": []}",
      "clarifications 中的每一条必须是具体的、可操作的问题，不是笼统的「请补充更多信息」"
    ].join("\n"),
    userPrompt: [
      "=== 迭代信息 ===",
      `名称: ${iteration.name}`,
      `描述: ${iteration.description}`,
      "",
      "=== 分析数据 ===",
      availableData,
      "",
      `请输出${config.documentType}。`
    ].join("\n")
  };

  const result = await runAnalysisPrompt(agentRunner, prompt);
  return parseArtifactResponse(result.content);
}

function parseArtifactResponse(content: string): { content: string; clarifications: string[] } {
  // 从末尾提取 JSON clarifications
  const jsonPattern = /\{"clarifications"\s*:\s*\[.*?\]\s*\}\s*$/s;
  const match = content.match(jsonPattern);

  let clarifications: string[] = [];
  let docContent = content;

  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { clarifications?: unknown };
      if (Array.isArray(parsed.clarifications)) {
        clarifications = parsed.clarifications.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
      }
      docContent = content.slice(0, match.index).trim();
    } catch (err) {
      log.debug("artifact response JSON parse failed, treating entire output as document", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { content: docContent, clarifications };
}

// ── 按需合成单个交付物（供 Coach 对话链路调用） ──

export async function synthesizeSingleArtifactOnDemand(
  agentRunner: AgentRunner,
  artifactId: string,
  iteration: Iteration,
  cc: ChangeControl
): Promise<{ content: string; clarifications: string[] }> {
  if (SKIP_LLM_SYNTHESIS.has(artifactId) || !ARTIFACT_PROMPTS[artifactId]) {
    return { content: "", clarifications: [] };
  }
  const availableData = serializeAvailableData(iteration, cc);
  return synthesizeSingleArtifact(agentRunner, artifactId, iteration, cc, availableData);
}

// ── 主入口 ──

export async function synthesizeArtifactDraftsViaLlm(
  agentRunner: AgentRunner | null,
  iteration: Iteration,
  cc: ChangeControl
): Promise<{
  updatedDrafts: Array<{ artifactId: string; content: string }>;
  clarifications: string[];
}> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Artifact synthesis requires LLM.");
  }

  const availableData = serializeAvailableData(iteration, cc);

  // 确定需要合成的 artifact
  const workflowItems = cc.artifactWorkflow?.items ?? [];
  const targetArtifacts = workflowItems
    .filter((item) => !SKIP_LLM_SYNTHESIS.has(item.id) && ARTIFACT_PROMPTS[item.id])
    .map((item) => item.id);

  if (targetArtifacts.length === 0) {
    return { updatedDrafts: [], clarifications: [] };
  }

  // 分批并发（每批 3 个）
  const batches = batchArray(targetArtifacts, 3) as string[][];
  const allDrafts: Array<{ artifactId: string; content: string }> = [];
  const allClarifications: string[] = [];

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((artifactId) =>
        synthesizeSingleArtifact(agentRunner, artifactId, iteration, cc, availableData)
          .then((r) => ({ artifactId, ...r }))
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.content) {
        allDrafts.push({ artifactId: result.value.artifactId, content: result.value.content });
        allClarifications.push(...result.value.clarifications);
      } else if (result.status === "rejected") {
        log.warn("artifact synthesis failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
        // 单个 artifact 失败不阻断其他，但会被记录
      }
    }
  }

  return {
    updatedDrafts: allDrafts,
    clarifications: Array.from(new Set(allClarifications))
  };
}
