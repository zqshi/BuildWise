/**
 * codePathPlatformLabelingOps — 代码路径归属端 LLM 标注（v0.30.0 T2）。
 *
 * 仿 synthesizeTestMatrixOp（testMatrixGenerationOps）：独立 LLM 调用为 boundary.codePaths
 * 每条标注归属 targetPlatform，产出 codePathsByPlatform，为端级门禁 assessPlatformCodeChangeReadiness
 * 提供按端真实依据（非编造）。无 LLM 时降级 undefined（门禁降级 go，向后兼容）。
 *
 * 纯函数（parse/build）+ 一次 LLM 调用（synthesize），零持久化。
 */
import type { AgentRunner, AgentRunOptions, AgentRunResult } from '../shared/agentRunner';
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import type { TargetPlatform } from '../../../domain/workspace/projectTypes';
import { safeJsonParse } from '../upload/attachmentUtils';

type RunAnalysisPrompt = (agentRunner: AgentRunner, prompt: IterationAgentPrompt, options?: AgentRunOptions) => Promise<AgentRunResult>;

export type SynthesizeCodePathPlatformParams = {
  iterationName: string;
  codePaths: string[];
  targetPlatforms: TargetPlatform[];
};

/** 构建归属端标注 prompt：数据段（结构化 codePaths + 目标端集合）+ 要求段（自然语言模板，遵守 CLAUDE.md LLM Prompt 规则）。 */
export function buildCodePathPlatformPrompt(params: SynthesizeCodePathPlatformParams): IterationAgentPrompt {
  return {
    agentId: "agent-code-path-platform-1",
    role: "boundary-guardian",
    scope: "iteration",
    goal: "为每条代码路径标注归属的目标端",
    expectedOutput: "JSON: {codePathsByPlatform:{<platform>:[path,...]}}",
    systemPrompt:
      "你是边界守卫。你必须只输出严格 JSON（不要用 ```json 包裹），所有 key 必须英文，不得输出解释文字。codePathsByPlatform 的 key 必须取自给定的目标端集合，每条代码路径归入唯一归属端。",
    userPrompt: [
      `所属迭代：${params.iterationName}`,
      `目标端集合：${params.targetPlatforms.join("/")}`,
      `待标注代码路径：${params.codePaths.join("、")}`,
      "要求：将上述每条代码路径归入其归属的目标端（按路径所属的业务端，如 web 前端目录归 web，ios 目录归 ios）。输出 codePathsByPlatform 对象，key 为目标端（取自上述集合），value 为该端代码路径数组。每条路径归入唯一端；无法明确判断归属的路径归入语义最接近的端。"
    ].join("\n\n")
  };
}

/** 解析 LLM 返回的归属端标注：解析 codePathsByPlatform 对象，按声明端取每端路径列表（过滤非法端）。 */
export function parseCodePathPlatformCandidate(
  content: string,
  targetPlatforms: TargetPlatform[]
): Record<TargetPlatform, string[]> | undefined {
  const parsed = safeJsonParse(content);
  const raw = parsed?.codePathsByPlatform;
  if (!raw || typeof raw !== "object") return undefined;
  const result: Partial<Record<TargetPlatform, string[]>> = {};
  for (const platform of targetPlatforms) {
    const list = (raw as Record<string, unknown>)[platform];
    if (Array.isArray(list)) {
      const cleaned = list
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 32);
      if (cleaned.length > 0) result[platform] = cleaned;
    }
  }
  const hasAny = Object.values(result).some((v) => v && v.length > 0);
  return hasAny ? (result as Record<TargetPlatform, string[]>) : undefined;
}

/**
 * 为代码路径标注归属端：调 LLM 产出 codePathsByPlatform。
 * agentRunner 为空 / codePaths 为空 → 返回 undefined（降级，门禁降级 go，与 synthesizeTestMatrixOp 空矩阵降级一致）。
 */
export async function synthesizeCodePathsByPlatformOp(
  agentRunner: AgentRunner | null,
  params: SynthesizeCodePathPlatformParams,
  deps: { runAnalysisPrompt: RunAnalysisPrompt }
): Promise<Record<TargetPlatform, string[]> | undefined> {
  if (!agentRunner) return undefined;
  if (params.codePaths.length === 0) return undefined;
  const prompt = buildCodePathPlatformPrompt(params);
  const selected = await deps.runAnalysisPrompt(agentRunner, prompt);
  return parseCodePathPlatformCandidate(selected.content, params.targetPlatforms);
}
