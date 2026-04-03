/**
 * OpenClaw Gateway Client
 *
 * 封装 OpenClaw Gateway 的 HTTP 调用，提供稳定的 Agent 执行接口。
 * 支持 Session 管理、Skill 调用、重试逻辑等。
 */

import { createLogger } from "../runtime/logger";

const log = createLogger("openclaw-gateway");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export const OPENCLAW_CONFIG = {
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789",
  apiKey: process.env.OPENCLAW_API_KEY || "",
  defaultTimeoutMs: parseInt(process.env.OPENCLAW_TIMEOUT_MS || "120000", 10),
  defaultModel: process.env.OPENCLAW_DEFAULT_MODEL || "claude-sonnet-4-20250514"
} as const;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type OpenClawSession = {
  sessionId: string;
  projectId?: number;
  iterationId?: number;
  createdAt: string;
  lastActivityAt: string;
  metadata: Record<string, unknown>;
};

export type SkillExecutionRequest = {
  skillId: string;
  input: Record<string, unknown>;
  sessionId: string;
  timeoutMs?: number;
  model?: string;
};

export type SkillExecutionResponse = {
  success: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  executionTime: number;
  sessionId: string;
};

export type AgentChatRequest = {
  agentId: string;
  message: string;
  sessionId: string;
  context?: Record<string, unknown>;
  model?: string;
};

export type AgentChatResponse = {
  success: boolean;
  reply?: string;
  structuredOutput?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  sessionId: string;
};

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

export class OpenClawGatewayError extends Error {
  readonly code: string;
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "OpenClawGatewayError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isOpenClawGatewayError(error: unknown): error is OpenClawGatewayError {
  return error instanceof OpenClawGatewayError;
}

// ---------------------------------------------------------------------------
// HTTP 客户端
// ---------------------------------------------------------------------------

class OpenClawHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultTimeout: number;

  constructor(config: typeof OPENCLAW_CONFIG) {
    this.baseUrl = config.gatewayUrl;
    this.apiKey = config.apiKey;
    this.defaultTimeout = config.defaultTimeoutMs;
  }

  /**
   * 发送 POST 请求
   */
  private async post<T>(
    endpoint: string,
    data: Record<string, unknown>,
    options: {
      timeoutMs?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text().catch(() => "");
        throw new OpenClawGatewayError(
          `OpenClaw Gateway error: ${response.status} - ${errorData}`,
          `HTTP_${response.status}`,
          response.status
        );
      }

      const result = await response.json() as T;
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OpenClawGatewayError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenClawGatewayError(
          `Request timeout after ${timeoutMs}ms`,
          "TIMEOUT"
        );
      }

      throw new OpenClawGatewayError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        "NETWORK_ERROR"
      );
    }
  }

  /**
   * 发送 GET 请求
   */
  private async get<T>(
    endpoint: string,
    options: {
      timeoutMs?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = { ...options.headers };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text().catch(() => "");
        throw new OpenClawGatewayError(
          `OpenClaw Gateway error: ${response.status} - ${errorData}`,
          `HTTP_${response.status}`,
          response.status
        );
      }

      const result = await response.json() as T;
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OpenClawGatewayError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenClawGatewayError(
          `Request timeout after ${timeoutMs}ms`,
          "TIMEOUT"
        );
      }

      throw new OpenClawGatewayError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        "NETWORK_ERROR"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Session 管理 API
  // ---------------------------------------------------------------------------

  async createSession(
    projectId?: number,
    iterationId?: number,
    metadata?: Record<string, unknown>
  ): Promise<OpenClawSession> {
    return this.post<OpenClawSession>("/api/v1/sessions", {
      projectId,
      iterationId,
      metadata: metadata || {}
    });
  }

  async getSession(sessionId: string): Promise<OpenClawSession | null> {
    try {
      return await this.get<OpenClawSession>(`/api/v1/sessions/${sessionId}`);
    } catch (error) {
      if (isOpenClawGatewayError(error) && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async updateSession(
    sessionId: string,
    updates: Partial<Pick<OpenClawSession, "metadata" | "lastActivityAt">>
  ): Promise<void> {
    await this.post<void>(`/api/v1/sessions/${sessionId}`, updates);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.post<void>(`/api/v1/sessions/${sessionId}/delete`, {});
  }

  // ---------------------------------------------------------------------------
  // Skill 执行 API
  // ---------------------------------------------------------------------------

  async executeSkill(request: SkillExecutionRequest): Promise<SkillExecutionResponse> {
    log.info(`[gateway] Executing skill: ${request.skillId}`, {
      sessionId: request.sessionId,
      inputKeys: Object.keys(request.input).join(", ")
    });

    const response = await this.post<SkillExecutionResponse>("/api/v1/skills/execute", request);

    log.info(`[gateway] Skill execution result: ${request.skillId}`, {
      success: response.success,
      executionTime: response.executionTime
    });

    return response;
  }

  // ---------------------------------------------------------------------------
  // Agent Chat API
  // ---------------------------------------------------------------------------

  async agentChat(request: AgentChatRequest): Promise<AgentChatResponse> {
    log.info(`[gateway] Agent chat: ${request.agentId}`, {
      sessionId: request.sessionId,
      messageLength: request.message.length
    });

    const response = await this.post<AgentChatResponse>("/api/v1/agents/chat", request);

    log.info(`[gateway] Agent chat result: ${request.agentId}`, {
      success: response.success
    });

    return response;
  }

  // ---------------------------------------------------------------------------
  // 健康检查 API
  // ---------------------------------------------------------------------------

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    gateway: string;
    timestamp: string;
  }> {
    try {
      return await this.get<{
        status: "healthy" | "degraded" | "unhealthy";
        gateway: string;
        timestamp: string;
      }>("/health", { timeoutMs: 5000 });
    } catch (error) {
      log.error("[gateway] Health check failed:", error);
      return {
        status: "unhealthy",
        gateway: this.baseUrl,
        timestamp: new Date().toISOString()
      };
    }
  }

  async probeGateway(): Promise<{
    reachable: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      const result = await this.get<{
        version: string;
        status: string;
      }>("/api/v1/status", { timeoutMs: 5000 });

      return {
        reachable: true,
        version: result.version,
        error: undefined
      };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 导出客户端实例
// ---------------------------------------------------------------------------

const client = new OpenClawHttpClient(OPENCLAW_CONFIG);

export {
  client,
  OPENCLAW_CONFIG,
  type OpenClawGatewayError
};
