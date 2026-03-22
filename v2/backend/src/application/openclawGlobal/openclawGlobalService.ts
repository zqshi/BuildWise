import { randomUUID } from "node:crypto";
import type { OpenclawGlobalRepository } from "../../domain/openclawGlobal/repository";
import type {
  OpenclawGlobalConversation,
  OpenclawGlobalMessage,
  OpenclawGlobalSkillRecord,
  OpenclawGlobalStrategyState
} from "../../domain/openclawGlobal/types";
import type { AgentRunner, AgentRunResult, ConversationMessage } from "../workspace/agentRunner";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { parsePolicyIntentFromReply } from "./policyIntentParser";
import { mergePolicyDeltaOp, GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID } from "../workspace/workspaceServicePolicyOps";
import { buildKnowledgeSyncContext } from "../workspace/knowledgeSyncService";

// ---------------------------------------------------------------------------
// LLM response sanitization — strip internal model markers
// ---------------------------------------------------------------------------

/**
 * 清洗 LLM 回复中的内部标记（如 MiniMax 的 tool_call XML、内部思考标签等）。
 * 在存储和返回给前端之前调用。
 */
function sanitizeLlmReply(raw: string): string {
  let text = raw;
  // Strip <minimax:tool_call> / <minimax_tool_call> blocks (colon or underscore variants)
  text = text.replace(/<minimax[_:]tool_call>[\s\S]*?<\/minimax[_:]tool_call>/gi, "");
  // Strip <tool_call>...</tool_call> blocks (generic)
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  // Strip <invoke ...>...</invoke> blocks
  text = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  // Strip <thinking>...</thinking> blocks (some models emit internal COT)
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  // Strip any remaining XML-like model-internal tags (e.g. <search>, <function_call>)
  text = text.replace(/<\/?(?:search|function_call|tool_use|result)[^>]*>/gi, "");
  // Strip [skills] prefixed lines
  text = text.replace(/^\[skills\].*$/gim, "");
  // Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// ---------------------------------------------------------------------------
// System prompt 用于全局业务助手对话
// ---------------------------------------------------------------------------

const GLOBAL_ASSISTANT_SYSTEM_PROMPT = [
  "你是 OpenClaw，BuildWise 平台的业务助手。你像一位懂技术的业务顾问——帮用户理清思路、制定策略、把经验沉淀下来。",
  "",
  "沟通风格：",
  "- 用自然的中文对话，像同事之间的讨论",
  "- 说人话，不说术语——用「订单超时自动取消」而不是「order timeout cancellation workflow」",
  "- 给建议时解释为什么，不要只给结论",
  "- 不要用编号列表、不要用 markdown 标记、不要结构化输出",
  "- 如果用户的想法不够清晰，帮他理清楚而不是照搬执行",
  "",
  "你的能力：",
  "- 帮用户制定和优化项目执行策略",
  "- 评估用户描述的工作流，提议将可复用的部分沉淀为 Skill",
  "- 跨项目维度给出建议（不局限于某个具体迭代）",
  "- 当用户要求恢复初始配置时，确认后清除所有自定义 Skill 和工作流",
  "",
  "边界：你不直接执行项目任务——具体的分析、编码、测试由各项目 Workspace 中的专业 Agent 完成。你的价值在于战略层面的思考和经验沉淀。",
  "",
  "策略变更输出约定：",
  "当你的建议涉及流程变更（如调整阶段、修改门禁、修改技能计划），在回复末尾以 HTML 注释形式输出结构化标记：",
  '<!-- policy:{"action":"add-stage|remove-stage|add-gate|remove-gate|modify-gate|modify-skill-plan","stage":"...","gate":{...},"skillsPlan":[...]} -->',
  "注意：这个标记对用户不可见，用于系统自动更新流程配置。每次回复最多一个策略变更标记。如果用户只是在讨论或提问，不要输出此标记。"
].join("\n");

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OpenclawGlobalService {
  private readonly repo: OpenclawGlobalRepository;
  private readonly agentRunner: AgentRunner | null;
  private readonly workspaceRepo: WorkspaceRepository | null;

  constructor(
    repo: OpenclawGlobalRepository,
    agentRunner: AgentRunner | null,
    workspaceRepo?: WorkspaceRepository | null
  ) {
    this.repo = repo;
    this.agentRunner = agentRunner;
    this.workspaceRepo = workspaceRepo ?? null;
  }

  // ---- 对话 ----

  listConversations(): OpenclawGlobalConversation[] {
    return this.repo.listConversations();
  }

  findConversation(conversationId: string): OpenclawGlobalConversation | null {
    return this.repo.findConversation(conversationId);
  }

  createConversation(title?: string): OpenclawGlobalConversation {
    const now = new Date().toISOString();
    return this.repo.createConversation({
      id: randomUUID(),
      title: title || "新对话",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
  }

  listMessages(conversationId: string): OpenclawGlobalMessage[] {
    return this.repo.listMessages(conversationId);
  }

  /**
   * 发送消息并获取 Agent 回复。
   * 返回 [用户消息, Agent 回复消息]。
   */
  async sendMessage(
    conversationId: string,
    content: string
  ): Promise<[OpenclawGlobalMessage, OpenclawGlobalMessage]> {
    const conversation = this.repo.findConversation(conversationId);
    if (!conversation) {
      throw new Error(`conversation_not_found: ${conversationId}`);
    }

    const now = new Date().toISOString();
    const userMsg = this.repo.appendMessage({
      id: randomUUID(),
      conversationId,
      role: "user",
      content,
      metadata: {},
      createdAt: now
    });

    // 构建对话历史供 LLM 消费（滑动窗口：最近 20 条，防止超出 context window）
    const history = this.repo.listMessages(conversationId);
    const recentHistory = history.slice(-20);
    const conversationMessages: ConversationMessage[] = recentHistory
      .filter((m) => m.role !== "system" && !m.content.startsWith("[LLM 调用失败]"))
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    let replyContent: string;
    let replyMetadata: Record<string, unknown> = {};

    if (this.agentRunner) {
      // 动态注入活跃项目的知识概要到 system prompt
      let systemPrompt = GLOBAL_ASSISTANT_SYSTEM_PROMPT;
      if (this.workspaceRepo) {
        const projectsSummary = buildGlobalProjectsKnowledgeSummary(this.workspaceRepo);
        if (projectsSummary) {
          systemPrompt = systemPrompt + "\n\n" + projectsSummary;
        }
      }
      try {
        const result: AgentRunResult = await this.agentRunner.runWithHistory(
          systemPrompt,
          conversationMessages,
          { sessionContext: { conversationId } }
        );
        replyContent = sanitizeLlmReply(result.content);
        replyMetadata = { model: result.model, source: "agent-runner" };
      } catch (error) {
        const errorDetail = error instanceof Error ? error.message : "unknown_error";
        replyContent = `抱歉，当前 AI 服务暂时不可用，请稍后重试。`;
        replyMetadata = { source: "agent-runner-error", error: errorDetail };
      }
    } else {
      replyContent = "当前未配置 LLM 运行时，业务助手暂时无法提供 AI 回复。请配置 LLM_API_BASE 等环境变量后重启服务。";
      replyMetadata = { source: "no-agent-runner" };
    }

    const assistantMsg = this.repo.appendMessage({
      id: randomUUID(),
      conversationId,
      role: "assistant",
      content: replyContent,
      metadata: replyMetadata,
      createdAt: new Date().toISOString()
    });

    // 更新对话时间戳
    conversation.updatedAt = new Date().toISOString();
    this.repo.updateConversation(conversation);

    // ── 策略回写后处理 ──
    if (this.workspaceRepo && replyMetadata.source === "agent-runner") {
      try {
        const intent = parsePolicyIntentFromReply(replyContent, conversationMessages);
        if (intent.type !== "no-policy-change" && intent.delta) {
          const mergeResult = mergePolicyDeltaOp(this.workspaceRepo, {
            projectId: GLOBAL_ORCHESTRATION_SCOPE_PROJECT_ID,
            actor: "global-assistant",
            delta: intent.delta,
            evidence: intent.evidence,
          });
          assistantMsg.metadata = {
            ...assistantMsg.metadata,
            policyIntent: intent.type,
            policyAction: mergeResult.action,
            policyVersion: mergeResult.policy.version,
          };
          // 更新已持久化的消息 metadata
          this.repo.appendMessage({ ...assistantMsg });
        }
      } catch (err) {
        // 策略回写失败记录警告，不阻塞主流程
        console.warn("[policy-write-failed]", err instanceof Error ? err.message : String(err));
      }
    }

    return [userMsg, assistantMsg];
  }

  // ---- Skill 管理 ----

  listSkills(): OpenclawGlobalSkillRecord[] {
    return this.repo.listSkills();
  }

  listActiveSkills(): OpenclawGlobalSkillRecord[] {
    return this.repo.listSkills().filter((s) => s.status === "active");
  }

  findSkill(skillId: string): OpenclawGlobalSkillRecord | null {
    return this.repo.findSkill(skillId);
  }

  saveSkill(skill: OpenclawGlobalSkillRecord): OpenclawGlobalSkillRecord {
    return this.repo.saveSkill(skill);
  }

  activateSkill(skillId: string): OpenclawGlobalSkillRecord | null {
    const skill = this.repo.findSkill(skillId);
    if (!skill) return null;
    skill.status = "active";
    skill.updatedAt = new Date().toISOString();
    this.repo.saveSkill(skill);

    const state = this.repo.getStrategyState();
    if (!state.activeSkillIds.includes(skillId)) {
      state.activeSkillIds.push(skillId);
      state.updatedAt = new Date().toISOString();
      this.repo.updateStrategyState(state);
    }
    return skill;
  }

  deprecateSkill(skillId: string): OpenclawGlobalSkillRecord | null {
    const skill = this.repo.findSkill(skillId);
    if (!skill) return null;
    skill.status = "deprecated";
    skill.updatedAt = new Date().toISOString();
    this.repo.saveSkill(skill);

    const state = this.repo.getStrategyState();
    state.activeSkillIds = state.activeSkillIds.filter((id) => id !== skillId);
    state.updatedAt = new Date().toISOString();
    this.repo.updateStrategyState(state);
    return skill;
  }

  // ---- 策略状态 ----

  getStrategyState(): OpenclawGlobalStrategyState {
    return this.repo.getStrategyState();
  }

  /**
   * 恢复初始配置：清除所有全局自定义 Skill 和自定义工作流描述。
   * 系统预置 Skill 不受影响（它们来自文件系统 SKILL.md，不在此 repo 中）。
   */
  restoreInitialConfig(): OpenclawGlobalStrategyState {
    // 将所有自定义 Skill 标记为 deprecated
    const skills = this.repo.listSkills();
    for (const skill of skills) {
      if (skill.status === "active") {
        skill.status = "deprecated";
        skill.updatedAt = new Date().toISOString();
        this.repo.saveSkill(skill);
      }
    }

    const now = new Date().toISOString();
    const state: OpenclawGlobalStrategyState = {
      activeSkillIds: [],
      customWorkflowDescriptions: [],
      lastResetAt: now,
      updatedAt: now
    };
    this.repo.updateStrategyState(state);
    return state;
  }
}

// ---------------------------------------------------------------------------
// 全局对话项目知识概要 — 聚合所有活跃项目的 KB 摘要
// ---------------------------------------------------------------------------

function buildGlobalProjectsKnowledgeSummary(workspaceRepo: WorkspaceRepository): string {
  const projects = workspaceRepo.listProjects().filter((p) => p.status === "active" || p.status === "in-progress");
  if (projects.length === 0) return "";

  const MAX_TOTAL_CHARS = 2000;
  const summaries: string[] = [];
  let totalChars = 0;

  for (const project of projects.slice(0, 6)) {
    const kb = project.knowledgeBase;
    if (!kb) continue;

    const kbContext = buildKnowledgeSyncContext(kb, { maxChars: 300 });
    if (!kbContext) continue;

    const entry = `[项目: ${project.name}]\n${kbContext}`;
    if (totalChars + entry.length > MAX_TOTAL_CHARS) break;
    summaries.push(entry);
    totalChars += entry.length;
  }

  if (summaries.length === 0) return "";
  return "当前活跃项目的知识概要：\n\n" + summaries.join("\n\n");
}
