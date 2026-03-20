/**
 * OpenClaw Gateway HTTP Client
 *
 * Connects to OpenClaw Gateway's OpenAI-compatible `/v1/chat/completions` endpoint.
 * Supports session persistence via `X-OpenClaw-Session-Key` header and
 * agent routing via `X-OpenClaw-Agent-Id` header.
 */

export type OpenClawGatewayConfig = {
  /** Gateway base URL, e.g. "http://127.0.0.1:18789" */
  baseUrl: string;
  /** Bearer token for authentication. Empty string = no auth. */
  token: string;
  /** Default agent ID. Defaults to "main". */
  defaultAgentId: string;
  /** Request timeout in milliseconds. Defaults to 120000. */
  timeoutMs: number;
};

export type GatewayChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

export type GatewayChatRequest = {
  messages: GatewayChatMessage[];
  /** OpenClaw agent ID to route to. Overrides config default. */
  agentId?: string;
  /** Session key for multi-turn persistence. Format: "agent:<agentId>:<namespace>" */
  sessionKey?: string;
  /** Whether to stream via SSE. Currently false — non-streaming only. */
  stream?: false;
};

export type GatewayChatResult = {
  content: string;
  model: string;
  sessionKey: string;
  finishReason?: string;
  truncated?: boolean;
};

export class OpenClawGatewayClient {
  private readonly config: OpenClawGatewayConfig;

  constructor(config: Partial<OpenClawGatewayConfig> & Pick<OpenClawGatewayConfig, "baseUrl">) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      token: config.token ?? "",
      defaultAgentId: config.defaultAgentId ?? "main",
      timeoutMs: config.timeoutMs ?? 120000
    };
  }

  /**
   * Derive a deterministic session key for a project+iteration context.
   * Maps to OpenClaw's session key format: `agent:<agentId>:project-<pid>-iteration-<iid>`
   */
  static deriveSessionKey(agentId: string, projectId: number, iterationId: number): string {
    return `agent:${agentId}:project-${projectId}-iteration-${iterationId}`;
  }

  /**
   * Derive a session key for project-level (non-iteration) conversations.
   */
  static deriveProjectSessionKey(agentId: string, projectId: number): string {
    return `agent:${agentId}:project-${projectId}`;
  }

  /**
   * Derive a session key for global (cross-project) conversations.
   */
  static deriveGlobalSessionKey(agentId: string, conversationId: string): string {
    return `agent:${agentId}:global-${conversationId}`;
  }

  async chat(request: GatewayChatRequest): Promise<GatewayChatResult> {
    const agentId = request.agentId || this.config.defaultAgentId;
    const sessionKey = request.sessionKey || "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-OpenClaw-Agent-Id": agentId
      };
      if (this.config.token) {
        headers.Authorization = `Bearer ${this.config.token}`;
      }
      if (sessionKey) {
        headers["X-OpenClaw-Session-Key"] = sessionKey;
      }

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: `openclaw/${agentId}`,
          stream: false,
          messages: request.messages
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`openclaw_gateway_http_${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
      }

      const payload = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("openclaw_gateway_empty_content");
      }

      const finishReason = payload.choices?.[0]?.finish_reason || undefined;
      return {
        content,
        model: payload.model || `openclaw/${agentId}`,
        sessionKey,
        finishReason,
        truncated: finishReason === "length"
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Health check — attempts a minimal request to verify Gateway is reachable.
   */
  async probe(): Promise<{ reachable: boolean; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const headers: Record<string, string> = {};
      if (this.config.token) {
        headers.Authorization = `Bearer ${this.config.token}`;
      }
      const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openclaw",
          stream: false,
          messages: [{ role: "user", content: "ping" }]
        }),
        signal: controller.signal
      });
      // Even a 4xx means the gateway is reachable
      if (res.status < 500) {
        return { reachable: true, error: "" };
      }
      return { reachable: false, error: `http_${res.status}` };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : "probe_failed"
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
