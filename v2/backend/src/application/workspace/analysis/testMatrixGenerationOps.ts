/**
 * testMatrixGenerationOps — 测试矩阵生成（接通 qa-reviewer 死代码预留）。
 *
 * v0.30.0 T1：extractGeneratedTestMatrix 依赖 qa-reviewer agent，但该 agent 从未被调度
 * （buildIterationAgentPlan 只含 orchestrator/requirements-analyst），generatedTestMatrix 永远空。
 * 本模块以独立 LLM 调用（仿 synthesizeReleaseReviewOp）生成测试矩阵，每条用例标注 targetPlatform
 * （单端归属），让 generatedTestMatrix 有真实数据，为按端聚合 coverage/passRate 提供依据。
 *
 * 纯函数（parse/build）+ 一次 LLM 调用（synthesize），零持久化。
 */
import { type AgentRunner, type AgentRunOptions, type AgentRunResult } from '../shared/agentRunner';
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import { normalizeTargetPlatforms, type TargetPlatform } from '../../../domain/workspace/projectTypes';
import type { IterationGeneratedTestCase } from '../../../domain/workspace/iterationTypes';
import { safeJsonParse } from '../upload/attachmentUtils';

type RunAnalysisPrompt = (agentRunner: AgentRunner, prompt: IterationAgentPrompt, options?: AgentRunOptions) => Promise<AgentRunResult>;

export type SynthesizeTestMatrixParams = {
  iterationName: string;
  sourceType: "single-file" | "folder";
  excerpt: string;
  targetPlatforms: TargetPlatform[];
};

/** 构建测试矩阵生成 prompt：数据段（结构化）+ 要求段（自然语言模板，遵守 CLAUDE.md LLM Prompt 规则）。 */
export function buildTestMatrixPrompt(params: SynthesizeTestMatrixParams): IterationAgentPrompt {
  return {
    agentId: "agent-test-matrix-1",
    role: "qa-reviewer",
    scope: "iteration",
    goal: "产出测试矩阵用例并为每条标注归属的目标端",
    expectedOutput: "JSON: {testMatrix:[{type,caseId,focus,expected,evidence,targetPlatform}]}",
    systemPrompt:
      "你是质量工程师。你必须只输出严格 JSON（不要用 ```json 包裹），所有 key 必须英文，不得输出解释文字。testMatrix 数组每条用例的 targetPlatform 必须取自给定的目标端集合。",
    userPrompt: [
      `所属迭代：${params.iterationName}`,
      `目标端集合：${params.targetPlatforms.join("/")}`,
      `分析对象来源：${params.sourceType === "folder" ? "文件夹" : "单文件"}`,
      `附件节选：${params.excerpt.slice(0, 2200) || "无"}`,
      "要求：基于附件内容与目标端集合，产出 testMatrix 测试用例数组。每条用例须包含 type（用例类型，如 unit/integration/e2e/acceptance）、caseId（唯一标识）、focus（测试焦点）、expected（预期结果）、evidence（依据）、targetPlatform（归属端，必须取自上述目标端集合）。用例数量 5 至 15 条，须覆盖各声明目标端。"
    ].join("\n\n")
  };
}

/** 解析 LLM 返回的测试矩阵候选：解析 testMatrix 数组，每条用 normalizeTargetPlatforms 兜底归属端。 */
export function parseTestMatrixCandidate(content: string): IterationGeneratedTestCase[] {
  const parsed = safeJsonParse(content);
  const matrix = parsed?.testMatrix;
  if (!Array.isArray(matrix)) return [];
  return matrix
    .map((row, index) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const caseIdRaw = typeof r.caseId === "string" ? r.caseId.trim() : "";
      return {
        type: typeof r.type === "string" ? r.type.trim() : "",
        caseId: caseIdRaw || `auto-case-${index + 1}`,
        focus: typeof r.focus === "string" ? r.focus.trim() : "",
        expected: typeof r.expected === "string" ? r.expected.trim() : "",
        evidence: typeof r.evidence === "string" ? r.evidence.trim() : "",
        targetPlatform: normalizeTargetPlatforms([r.targetPlatform])[0],
        executionStatus: "pending" as const,
        executionUpdatedAt: "",
        executionBy: "",
        executionNote: ""
      };
    })
    .filter((item) => item.type || item.caseId || item.focus || item.expected || item.evidence)
    .slice(0, 50);
}

/**
 * 生成测试矩阵：调 LLM 产出 testMatrix 数组（每条标 targetPlatform）。
 * agentRunner 为空 → 抛 LlmUnavailableError（仿 synthesizeReleaseReviewOp）。
 */
export async function synthesizeTestMatrixOp(
  agentRunner: AgentRunner | null,
  params: SynthesizeTestMatrixParams,
  deps: { runAnalysisPrompt: RunAnalysisPrompt }
): Promise<IterationGeneratedTestCase[]> {
  if (!agentRunner) {
    // 无 LLM 配置时降级空矩阵，不阻断 analysis 管道（与原 extractGeneratedTestMatrix 行为一致）。
    // 区别于 governance synthesizeReleaseReviewOp 的 throw：测试矩阵生成是增强，空矩阵可接受；
    // releaseReview 是关键决策必须 LLM。有 LLM 时才生成真实按端数据。
    return [];
  }
  const prompt = buildTestMatrixPrompt(params);
  const selected = await deps.runAnalysisPrompt(agentRunner, prompt);
  return parseTestMatrixCandidate(selected.content);
}
