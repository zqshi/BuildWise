/**
 * Agent Runner (OpenClaw Gateway 版本)
 *
 * 重构为基于 OpenClaw Gateway 的稳定 LLM 调用层。
 * 提供 Agent 执行能力，支持 Session 管理、Skill 调用、重试逻辑等。
 */

import type {
  AgentRunResult,
  AgentRunOptions,
  ConversationMessage,
  AgentRunner as AgentRunnerInterface
} from "../../domain/shared/agentRunner";
import type { IterationAgentPrompt } from "../../domain/workspace/types";
import {
  client,
  OPENCLAW_CONFIG,
  type SkillId,
  getSkillDefinition,
  type OpenClawGatewayError
} from "../../infrastructure/openclaw/openclawGatewayClient";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("agent-runner-gateway");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export const AGENT_RUNNER_CONFIG = {
  // 是否使用 OpenClaw Gateway
  useOpenClawGateway: process.env.USE_OPENCLAW_GATEWAY === "1" || true,
  // Gateway 超时时间
  gatewayTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || "120000", 10),
  // 最大重试次数
  maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || "2", 10),
  // 重试退避乘数
  retryBackoffMultiplier: 2,
  // 重试初始延迟
  retryInitialDelayMs: 1000
} as const;

// ---------------------------------------------------------------------------
// Agent 定义
// ---------------------------------------------------------------------------

const AGENT_DEFINITIONS = {
  "iteration-coach": {
    id: "agent-buildwise-iteration-coach",
    name: "迭代教练",
    capabilities: [
      "natural-language-chat",
      "intent-inference",
      "artifact-generation",
      "business-rule-capture"
    ],
    defaultModel: OPENCLAW_CONFIG.defaultModel,
    timeoutMs: AGENT_RUNNER_CONFIG.gatewayTimeoutMs
  },

  "artifact-generator": {
    id: "agent-buildwise-artifact-generator",
    name: "交付物生成器",
    capabilities: [
      "strict-json-output",
      "schema-validation",
      "format-compliance"
    ],
    defaultModel: OPENCLAW_CONFIG.defaultModel,
    timeoutMs: AGENT_RUNNER_CONFIG.gatewayTimeoutMs
  },

  "business-rule-analyzer": {
    id: "agent-buildwise-business-rule-analyzer",
    name: "业务规则分析器",
    capabilities: [
      "rule-extraction",
      "entity-mapping",
      "conflict-detection"
    ],
    defaultModel: OPENCLAW_CONFIG.defaultModel,
    timeoutMs: AGENT_RUNNER_CONFIG.gatewayTimeoutMs
  },

  "ontology-manager": {
    id: "agent-buildwise-ontology-manager",
    name: "本体管理器",
    capabilities: [
      "term-extraction",
      "entity-mapping",
      "relationship-detection",
      "collision-detection"
    ],
    defaultModel: OPENCLAW_CONFIG.defaultModel,
    timeoutMs: AGENT_RUNNER_CONFIG.gatewayTimeoutMs
  },

  "change-impact-analyzer": {
    id: "agent-buildwise-change-impact-analyzer",
    name: "变更影响分析器",
    capabilities: [
      "change-detection",
      "impact-scope-calculation",
      "artifact-dependency-analysis"
    ],
    defaultModel: OPENCLAW_CONFIG.defaultModel,
    timeoutMs: 60000
  }
} as const;

export type AgentId = keyof typeof AGENT_DEFINITIONS;

export function getAgentDefinition(agentId: AgentId): typeof AGENT_DEFINITIONS[AgentId] {
  return AGENT_DEFINITIONS[agentId];
}

// ---------------------------------------------------------------------------
// Session 管理
// ---------------------------------------------------------------------------

class SessionManager {
  private readonly sessions = new Map<string, {
    sessionId: string;
    projectId?: number;
    iterationId?: number;
    createdAt: string;
    lastActivityAt: string;
    messages: ConversationMessage[];
  }>();

  /**
   * 获取或创建 Session
   */
  async getOrCreateSession(
    agentId: AgentId,
    projectId?: number,
    iterationId?: number
  ): Promise<string> {
    // 查找现有 session
    for (const [sessionId, session] of this.sessions.entries()) {
      if (
        session.projectId === projectId &&
        session.iterationId === iterationId &&
        session.messages.length > 0
      ) {
        // 更新活动时间
        session.lastActivityAt = new Date().toISOString();
        return sessionId;
      }
    }

    // 创建新 session
    const sessionId = await client.createSession(projectId, iterationId, {
      agentId,
      createdAt: new Date().toISOString()
    });

    this.sessions.set(sessionId, {
      sessionId,
      projectId,
      iterationId,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      messages: []
    });

    log.info(`[session-manager] Created session ${sessionId} for agent ${agentId}`);
    return sessionId;
  }

  /**
   * 添加消息到 Session
   */
  addMessage(sessionId: string, message: ConversationMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages.push(message);
    session.lastActivityAt = new Date().toISOString();
  }

  /**
   * 获取 Session 消息
   */
  getMessages(sessionId: string): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    return session?.messages || [];
  }

  /**
   * 结束 Session
   */
  async endSession(sessionId: string): Promise<void> {
    const messages = this.getMessages(sessionId);
    await client.updateSession(sessionId, {
      messageCount: messages.length
    });
    this.sessions.delete(sessionId);
    log.info(`[session-manager] Ended session ${sessionId} with ${messages.length} messages`);
  }
}

// ---------------------------------------------------------------------------
// OpenClaw Gateway Agent Runner
// ---------------------------------------------------------------------------

class OpenClawAgentRunner implements AgentRunnerInterface {
  private readonly sessionManager = new SessionManager();

  /**
   * 运行 Agent（单次调用）
   */
  async run(
    prompt: IterationAgentPrompt,
    options?: AgentRunOptions
  ): Promise<AgentRunResult> {
    const startTime = Date.now();

    try {
      // 确定使用哪个 Agent
      const agentId: AgentId = this.resolveAgentId(prompt);

      // 获取 Agent 定义
      const agentDef = getAgentDefinition(agentId);

      // 获取或创建 Session
      const sessionContext = options?.sessionContext || {};
      const sessionId = await this.sessionManager.getOrCreateSession(
        agentId,
        sessionContext.projectId,
        sessionContext.iterationId
      );

      // 构建 Agent 调用请求
      const request = {
        agentId: agentDef.id,
        message: prompt.userPrompt,
        sessionId,
        context: {
          systemPrompt: prompt.systemPrompt,
          role: prompt.role,
          goal: prompt.goal,
          expectedOutput: prompt.expectedOutput || "natural language response",
          ...sessionContext
        },
        model: options?.modelOverride || agentDef.defaultModel
      };

      // 执行 Agent 聊天
      const response = await client.agentChat(request);

      // 添加消息到 Session
      this.sessionManager.addMessage(sessionId, {
        role: "user",
        content: prompt.userPrompt
      });

      if (response.success && response.reply) {
        this.sessionManager.addMessage(sessionId, {
          role: "assistant",
          content: response.reply
        });
      }

      const executionTimeMs = Date.now() - startTime;

      if (response.success) {
        log.info(`[agent-runner] Agent ${agentId} executed successfully`, {
          executionTimeMs,
          replyLength: response.reply?.length || 0,
          hasStructuredOutput: !!response.structuredOutput
        });

        return {
          content: response.reply || "",
          model: agentDef.defaultModel,
          finishReason: "stop",
          truncated: false
        };
      } else {
        log.error(`[agent-runner] Agent ${agentId} failed`, response.error);

        // 如果是超时错误，尝试重试
        if (response.error?.includes("timeout")) {
          return await this.runWithRetry(prompt, options, agentId);
        }

        throw new Error(response.error || "Agent execution failed");
      }
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      log.error(`[agent-runner] Agent execution threw exception`, error);

      throw error;
    }
  }

  /**
   * 带历史消息运行 Agent
   */
  async runWithHistory(
    systemPrompt: string,
    messages: ConversationMessage[],
    options?: AgentRunOptions
  ): Promise<AgentRunResult> {
    const startTime = Date.now();

    try {
      const agentId: AgentId = "iteration-coach";

      // 获取或创建 Session
      const sessionContext = options?.sessionContext || {};
      const sessionId = await this.sessionManager.getOrCreateSession(
        agentId,
        sessionContext.projectId,
        sessionContext.iterationId
      );

      // 构建 Agent 调用请求（带历史消息）
      const lastMessage = messages[messages.length - 1];
      const request = {
        agentId: getAgentDefinition(agentId).id,
        message: lastMessage.content,
        sessionId,
        context: {
          systemPrompt,
          history: messages.slice(0, -1),
          ...sessionContext
        }
      };

      // 执行 Agent
      const response = await client.agentChat(request);

      const executionTimeMs = Date.now() - startTime;

      if (response.success) {
        log.info(`[agent-runner] Agent with history executed successfully`, {
          executionTimeMs,
          historyLength: messages.length
        });

        return {
          content: response.reply || "",
          model: getAgentDefinition(agentId).defaultModel,
          finishReason: "stop",
          truncated: false
        };
      } else {
        throw new Error(response.error || "Agent execution failed");
      }
    } catch (error) {
      log.error(`[agent-runner] Agent with history threw exception`, error);
      throw error;
    }
  }

  /**
   * 带重试的 Agent 运行
   */
  private async runWithRetry(
    prompt: IterationAgentPrompt,
    options?: AgentRunOptions,
    agentId?: AgentId
  ): Promise<AgentRunResult> {
    const targetAgentId = agentId || this.resolveAgentId(prompt);
    const config = AGENT_RUNNER_CONFIG;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        log.info(`[agent-runner] Retry attempt ${attempt}/${config.maxRetries} for agent ${targetAgentId}`);

        const result = await this.run(prompt, options);

        // 成功则直接返回
        return result;
      } catch (error) {
        if (attempt === config.maxRetries) {
          log.error(`[agent-runner] All ${config.maxRetries} retry attempts failed`);
          throw error;
        }

        // 等待后重试
        const delayMs = config.retryInitialDelayMs * Math.pow(config.retryBackoffMultiplier, attempt - 1);
        log.info(`[agent-runner] Waiting ${delayMs}ms before retry...`);
        await this.sleep(delayMs);
      }
    }

    throw new Error("Max retries exceeded");
  }

  /**
   * 解析 Prompt 中的 Agent ID
   */
  private resolveAgentId(prompt: IterationAgentPrompt): AgentId {
    // 从 agentId 字段解析
    if (prompt.agentId && Object.keys(AGENT_DEFINITIONS).includes(prompt.agentId)) {
      return prompt.agentId as AgentId;
    }

    // 从 role 字段推断
    if (prompt.role?.includes("coach")) return "iteration-coach";
    if (prompt.role?.includes("artifact")) return "artifact-generator";
    if (prompt.role?.includes("ontology")) return "ontology-manager";
    if (prompt.role?.includes("impact")) return "change-impact-analyzer";

    // 默认使用 iteration-coach
    return "iteration-coach";
  }

  /**
   * 工具方法：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 结束 Session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.sessionManager.endSession(sessionId);
  }

  /**
   * 获取 Session 消息
   */
  getSessionMessages(sessionId: string): ConversationMessage[] {
    return this.sessionManager.getMessages(sessionId);
  }
}

// ---------------------------------------------------------------------------
// 创建 Agent Runner 函数
// ---------------------------------------------------------------------------

export function createAgentRunnerFromEnv(): OpenClawAgentRunner | null {
  if (!AGENT_RUNNER_CONFIG.useOpenClawGateway) {
    log.warn("[agent-runner] OpenClaw Gateway disabled, using direct LLM");
    return null;
  }

  log.info("[agent-runner] Creating OpenClaw Gateway Agent Runner", {
    gatewayUrl: OPENCLAW_CONFIG.gatewayUrl,
    timeoutMs: AGENT_RUNNER_CONFIG.gatewayTimeoutMs,
    maxRetries: AGENT_RUNNER_CONFIG.maxRetries
  });

  return new OpenClawAgentRunner();
}

// ---------------------------------------------------------------------------
// 兼容性：重导出 domain 接口
// ---------------------------------------------------------------------------

export type { AgentRunner as AgentRunner } from "../../domain/shared/agentRunner";
export type { AgentRunResult, AgentRunOptions, ConversationMessage } from "../../domain/shared/agentRunner";

// 导出工具函数
export {
  createAgentRunnerFromEnv,
  getAgentDefinition,
  type AgentId,
  type OpenClawGatewayError
};
