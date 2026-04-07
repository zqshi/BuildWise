/**
 * Coach Ops — 教练操作
 *
 * 基于直接 LLM 调用提供迭代对话能力。
 * 使用注入的 AgentRunner（来自 infrastructure/llm/agentRunnerFactory）。
 */

import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse, Project } from "../../domain/workspace/types";
import type { ProjectKnowledgeBase } from "../../domain/workspace/projectTypes";
import type { AgentRunner } from "./agentRunner";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("coach-ops");

// ---------------------------------------------------------------------------
// System Prompt 构建
// ---------------------------------------------------------------------------

function buildCoachSystemPrompt(
  project: Project,
  iteration: Iteration,
  previousIteration: Iteration | null,
  knowledgeBase: ProjectKnowledgeBase | undefined
): string {
  const ontologyTerms = knowledgeBase?.ontologyTerms?.map(t => `${t.term}: ${t.definition}`) ?? [];
  const businessRules = knowledgeBase?.stableRules?.map(r => r.rule) ?? [];
  const knownRisks = knowledgeBase?.knownRisks?.map(r => r.risk) ?? [];

  const scopeSection = iteration.scope
    ? `## 当前迭代范围
- 包含：${iteration.scope.inScope.join("、") || "未定义"}
- 排除：${iteration.scope.outOfScope.join("、") || "未定义"}
- 验收标准：${iteration.scope.acceptanceCriteria.join("、") || "未定义"}`
    : "";

  const ontologySection = ontologyTerms.length > 0
    ? `## 领域术语（本体）
${ontologyTerms.slice(0, 20).join("\n")}`
    : "";

  const rulesSection = businessRules.length > 0
    ? `## 已知业务规则
${businessRules.slice(0, 15).join("\n")}`
    : "";

  const risksSection = knownRisks.length > 0
    ? `## 已知风险
${knownRisks.slice(0, 10).join("\n")}`
    : "";

  const continuitySection = previousIteration
    ? `## 上一迭代
- 名称：${previousIteration.name}
- 状态：${previousIteration.status}
- 摘要：${previousIteration.aiSummary || "无"}`
    : "";

  return `你是 BuildWise 迭代教练，负责引导用户从模糊需求推进到可交付成果。

## 项目信息
- 项目：${project.name}
- 描述：${project.description}

## 当前迭代
- 名称：${iteration.name}
- 状态：${iteration.status}
- 目标：${iteration.goals.join("、") || "未定义"}

${scopeSection}

${continuitySection}

${ontologySection}

${rulesSection}

${risksSection}

## 你的职责
1. 理解用户意图，引导需求澄清
2. 当用户上传材料后，协助分析和确认
3. 在边界确认阶段，帮助锁定变更范围
4. 在开发阶段，协助代码审查和技术决策
5. 在测试阶段，协助验收和质量评审
6. 在发布阶段，协助发布评审和风险评估

## 回复要求
- 使用自然语言对话，不要机械僵硬
- 每次回复聚焦一个主题，不要信息轰炸
- 如果用户意图不清楚，主动追问
- 基于已有的领域术语和业务规则回复，保持一致性`.trim();
}

// ---------------------------------------------------------------------------
// Intent 推断
// ---------------------------------------------------------------------------

type CoachIntent = IterationCoachChatResponse["intent"];

function inferIntent(message: string, iterationStatus: string): CoachIntent {
  const lower = message.toLowerCase();

  if (/上传|文件|材料|附件|文档/.test(lower)) return "collect-attachment";
  if (/澄清|确认|疑问|不清楚|什么意思/.test(lower)) return "clarify";
  if (/边界|范围|scope|变更/.test(lower)) return "confirm-boundary";
  if (/计划|规划|方案|设计/.test(lower)) return "plan";
  if (/测试|验收|质量|qa/.test(lower)) return "qa";
  if (/发布|上线|release|部署/.test(lower)) return "release";
  if (/全流程|full.?cycle|一键/.test(lower)) return "full-cycle";

  // 根据迭代状态推断默认意图
  if (iterationStatus === "planned") return "collect-attachment";
  if (iterationStatus === "in-progress") return "plan";
  if (iterationStatus === "review") return "qa";

  return "general";
}

// ---------------------------------------------------------------------------
// 主函数：教练对话处理
// ---------------------------------------------------------------------------

export async function coachIterationConversationOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  message: string,
  _modelingRepo: unknown = null
): Promise<IterationCoachChatResponse | null> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;

  const project = repo.findProject(iteration.projectId);
  if (!project) return null;

  // LLM 不可用时降级
  if (!agentRunner) {
    log.warn("[coach-ops] AgentRunner unavailable, returning degraded response");
    return {
      iterationId,
      intent: inferIntent(message, iteration.status),
      reply: "AI 助手当前不可用（LLM 未配置或不可达），请检查 LLM_API_BASE 和 LLM_API_KEY 环境变量。",
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: ["检查 LLM 配置"], clarificationChecklist: [] },
      llm: { used: false, model: "", degraded: true, reason: "agent_runner_unavailable" }
    };
  }

  // 获取前一次迭代
  const iterations = repo.listIterations(iteration.projectId);
  const currentIndex = iterations.findIndex(it => it.id === iterationId);
  const previousIteration = currentIndex > 0 ? iterations[currentIndex - 1] : null;

  // 构建 system prompt
  const systemPrompt = buildCoachSystemPrompt(project, iteration, previousIteration, project.knowledgeBase);

  // 获取近期消息（作为对话历史），过滤掉 system 角色（Anthropic API 不接受）
  const allMessages = repo.listMessages(iterationId);
  const recentMessages = allMessages
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content.length > 800 ? m.content.substring(0, 800) + "..." : m.content
    }));

  // 加入当前消息
  const conversationMessages = [
    ...recentMessages,
    { role: "user" as const, content: message }
  ];

  const startTime = Date.now();

  try {
    const result = await agentRunner.runWithHistory(systemPrompt, conversationMessages);

    const executionTimeMs = Date.now() - startTime;
    log.info("[coach-ops] Coach chat completed", {
      executionTimeMs,
      model: result.model,
      replyLength: result.content.length,
      truncated: result.truncated
    });

    const intent = inferIntent(message, iteration.status);

    return {
      iterationId,
      intent,
      reply: result.content,
      execution: { action: "none", instruction: "", apply: false },
      guidance: {
        uploadRecommended: intent === "collect-attachment",
        suggestedUploadTypes: [],
        suggestedActions: [],
        clarificationChecklist: []
      },
      llm: {
        used: true,
        model: result.model || "",
        degraded: !!result.truncated,
        reason: result.truncated ? "response_truncated" : ""
      }
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error("[coach-ops] Coach chat failed", { executionTimeMs, error: errorMsg });

    return {
      iterationId,
      intent: "general",
      reply: `处理过程中发生错误：${errorMsg}`,
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
      llm: { used: false, model: "", degraded: true, reason: errorMsg }
    };
  }
}
