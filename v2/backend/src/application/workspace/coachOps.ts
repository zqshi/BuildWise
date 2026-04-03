/**
 * Coach Ops — 教练操作
 *
 * 基于 OpenClaw Gateway 提供稳定的迭代对话和交付物生成能力。
 * 集成 Skill 执行、验证、重试等机制。
 */

import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse, IterationChangeControl } from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import type { AgentId } from "./agentRunnerFactoryGateway";
import { createOpenClawGatewayRunner } from "./agentRunnerFactoryGateway";
import { executor as skillExecutor, type SkillId } from "./skillExecutor";
import type { TestMatrixArtifact, BoundaryArtifact, PRDArtifact } from "../../domain/workspace/artifactSchemas";
import { validateArtifactDraft, extractTestCases } from "./artifactValidator";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("coach-ops");

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

type CoachContext = {
  iteration: Iteration;
  project: any;
  previousIteration: Iteration | null;
  knowledgeBase: any;
  ontologyTerms: string[];
  businessRules: string[];
  recentMessages: Array<{ role: string; content: string }>;
};

// ---------------------------------------------------------------------------
// 上下文构建器
// ---------------------------------------------------------------------------

function buildCoachContext(
  iteration: Iteration,
  project: any,
  previousIteration: Iteration | null,
  knowledgeBase: any
): CoachContext {
  const ontologyTerms = knowledgeBase?.ontologyTerms?.map((t: any) => t.term) || [];
  const businessRules = knowledgeBase?.stableRules?.map((r: any) => r.rule) || [];

  return {
    iteration,
    project,
    previousIteration,
    knowledgeBase,
    ontologyTerms,
    businessRules,
    recentMessages: []
  };
}

// ---------------------------------------------------------------------------
// 交付物生成器（基于 Skill）
// ---------------------------------------------------------------------------

async function generateArtifactViaSkill(
  artifactId: string,
  skillId: SkillId,
  context: CoachContext,
  input: Record<string, unknown>
): Promise<{ success: boolean; content?: string; error?: string }> {
  log.info(`[coach-ops] Generating ${artifactId} using skill ${skillId}`);

  const projectId = context.iteration.projectId;
  const iterationId = context.iteration.id;

  try {
    // 使用 Skill 执行器
    const result = await skillExecutor.executeSkillWithValidation(
      artifactId,
      skillId,
      input,
      projectId,
      iterationId,
      3 // 最多重试 3 次
    );

    if (result.success && result.result) {
      log.info(`[coach-ops] Generated ${artifactId} successfully`, {
        attempts: result.attempts
      });
      return { success: true, content: JSON.stringify(result.result) };
    } else {
      const errorMsg = result.error || "Generation failed after all attempts";
      log.error(`[coach-ops] Failed to generate ${artifactId}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    log.error(`[coach-ops] Exception generating ${artifactId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ---------------------------------------------------------------------------
// 主函数：教练对话处理
// ---------------------------------------------------------------------------

export async function coachIterationConversationOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  message: string,
  modelingRepo: any | null = null
): Promise<IterationCoachChatResponse | null> {
  // 获取迭代信息
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }

  const projectId = iteration.projectId;
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }

  // 获取前一次迭代
  const iterations = repo.listIterations(projectId);
  const currentIndex = iterations.findIndex(it => it.id === iterationId);
  const previousIteration = currentIndex > 0 ? iterations[currentIndex - 1] : null;

  // 构建上下文
  const context = buildCoachContext(iteration, project, previousIteration, project.knowledgeBase);

  // 获取最近的对话消息
  const allMessages = repo.listMessages(iterationId);
  const recentMessages = allMessages.slice(-8).map(m => ({
    role: m.role,
    content: m.content.substring(0, 500) // 限制长度
  }));

  // 尝试使用 OpenClaw Gateway
  const gatewayRunner = createOpenClawGatewayRunner();

  if (gatewayRunner) {
    return await coachWithGateway(
      gatewayRunner,
      repo,
      iteration,
      context,
      message,
      recentMessages,
      projectId
    );
  }

  // 降级到旧的实现（如果有）
  log.warn("[coach-ops] Gateway unavailable, would use legacy implementation");
  return null;
}

// ---------------------------------------------------------------------------
// 基于 Gateway 的 Coach 实现
// ---------------------------------------------------------------------------

async function coachWithGateway(
  gatewayRunner: any,
  repo: WorkspaceRepository,
  iteration: Iteration,
  context: CoachContext,
  message: string,
  recentMessages: any[],
  projectId: number
): Promise<IterationCoachChatResponse> {
  const startTime = Date.now();

  try {
    // 构建 Agent Chat 请求
    const request = {
      agentId: "iteration-coach",
      message,
      sessionId: `${projectId}-${iteration.id}`,
      context: {
        iterationId: iteration.id,
        iterationName: iteration.name,
        iterationStatus: iteration.status,
        scope: iteration.scope,
        ontologyTerms: context.ontologyTerms,
        businessRules: context.businessRules,
        recentMessages: recentMessages
      }
    };

    // 执行 Agent Chat
    const response = await gatewayRunner.agentChat(request);

    if (!response.success) {
      return {
        iterationId: iteration.id,
        intent: "general",
        reply: `抱歉，AI 助手暂时不可用：${response.error || "未知错误"}`,
        execution: { action: "none", instruction: "", apply: false },
        guidance: { uploadRecommended: false, suggestedActions: ["请稍后重试"], clarificationChecklist: [] },
        llm: { used: false, model: "", degraded: true, reason: response.error || "agent_unavailable" }
      };
    }

    const executionTimeMs = Date.now() - startTime;
    log.info(`[coach-ops] Coach chat completed`, { executionTimeMs });

    // 简化响应处理（不进行复杂的解析）
    const reply = response.reply || "我已收到您的消息，正在处理...";

    return {
      iterationId: iteration.id,
      intent: "general",
      reply,
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedActions: [], clarificationChecklist: [] },
      llm: {
        used: true,
        model: response.structuredOutput?.model || "openclaw-model",
        degraded: false,
        reason: ""
      }
    };
  } catch (error) {
    log.error("[coach-ops] Coach chat threw exception:", error);

    return {
      iterationId: iteration.id,
      intent: "general",
      reply: `处理过程中发生错误：${error instanceof Error ? error.message : String(error)}`,
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedActions: [], clarificationChecklist: [] },
      llm: {
        used: false,
        model: "",
        degraded: true,
        reason: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export {
  generateArtifactViaSkill,
  type SkillId
};
