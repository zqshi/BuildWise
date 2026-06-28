/**
 * OpenHandsAdapter — 调用 OpenHands agent-server（HTTP REST）的编码 Agent 适配器
 *
 * 实现 CodingAgentAdapter 端口，对称 ClaudeCodeCliAdapter（后者调 claude CLI 子进程，本适配器调常驻 agent-server REST）。
 *
 * REST 契约（对照 agent-server openapi，2026-06-28 实测确认，非接续点旧调研）：
 * - 鉴权 header：X-Session-API-Key（非 Authorization: Bearer）
 * - 创建会话：POST /api/conversations（StartConversationRequest：workspace.working_dir + initial_message + agent.llm）
 * - 触发执行：POST /api/conversations/{id}/run
 * - 查询状态：GET /api/conversations/{id} → execution_status 映射（ConversationExecutionStatus）
 * - 拉取事件：GET /api/conversations/{id}/events/search?timestamp__gte= → EventPage.items[]
 * - 取消会话：POST /api/conversations/{id}/interrupt
 *
 * LLM 配置在创建会话时随 agent.llm 传入（base_url/api_key/model），无需额外 switch_llm。
 * agent 在 repoPath 内真实改代码，BuildWise 事后用 git diff + 边界校验（executor 层 gitOps.listChangedPaths）。
 *
 * 声明+运行时分离：业务层通过 AgentRegistry.create("openhands") 获取实例，不直接 import 本类。
 * 依赖注入 httpFn：生产用 fetch wrapper（闭包持有 baseUrl + apiKey），测试用 mock 注入伪响应。
 */

import type {
  CodingAgentAdapter,
  CodingAgentEvent,
  CodingSessionStatus,
  CodingTaskContext,
} from "../../../domain/shared/codingAgent";

export type HttpFn = (
  method: string,
  path: string,
  body?: unknown
) => Promise<{ ok: boolean; status: number; data: unknown }>;

type AdapterOptions = {
  httpFn?: HttpFn;
  env?: Record<string, string | undefined>;
};

type SessionState = {
  conversationId: string;
  cancelled: boolean;
};

const AGENT_TYPE = "openhands";

// agent-server ConversationExecutionStatus → CodingSessionStatus.status
const EXECUTION_STATUS_MAP: Record<string, CodingSessionStatus["status"]> = {
  idle: "running",
  running: "running",
  paused: "running",
  waiting_for_confirmation: "running",
  finished: "completed",
  error: "failed",
  stuck: "failed",
  deleting: "failed",
};

export class OpenHandsAdapter implements CodingAgentAdapter {
  readonly agentType = AGENT_TYPE;
  readonly implemented: boolean;
  private readonly httpFn: HttpFn;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly llm: { baseUrl: string; apiKey: string; model: string };
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: AdapterOptions = {}) {
    const env = options.env ?? process.env;
    this.baseUrl = (env.OPENHANDS_BASE_URL ?? "").trim().replace(/\/+$/, "");
    this.apiKey = (env.OPENHANDS_API_KEY ?? "").trim();
    this.implemented = Boolean(this.baseUrl);
    this.llm = {
      baseUrl: (env.OPENHANDS_LLM_BASE_URL ?? "").trim(),
      apiKey: (env.OPENHANDS_LLM_API_KEY ?? "").trim(),
      model: (env.OPENHANDS_MODEL ?? "").trim(),
    };
    this.httpFn = options.httpFn ?? this.createDefaultHttpFn();
  }

  async start(context: CodingTaskContext): Promise<{ sessionId: string }> {
    const body = {
      workspace: { working_dir: context.repoPath, kind: "LocalWorkspace" },
      initial_message: { content: [{ text: this.buildInitialMessage(context) }] },
      agent: {
        kind: "Agent",
        llm: {
          model: this.llm.model,
          api_key: this.llm.apiKey,
          base_url: this.llm.baseUrl || undefined,
        },
        tools: [{ name: "terminal" }, { name: "file_editor" }],
        system_prompt_kwargs: { llm_security_analyzer: false },
      },
      confirmation_policy: { kind: "NeverConfirm" },
    };
    const res = await this.httpFn("POST", "/api/conversations", body);
    const conversationId = String((res.data as Record<string, unknown> | null)?.id ?? "");
    if (!conversationId) {
      throw new Error("OpenHands start failed: missing conversation id");
    }
    this.sessions.set(conversationId, { conversationId, cancelled: false });
    await this.httpFn("POST", `/api/conversations/${conversationId}/run`, {});
    return { sessionId: conversationId };
  }

  private buildInitialMessage(context: CodingTaskContext): string {
    const lines: string[] = [context.instruction];
    if (context.boundaryCodePaths.length > 0) {
      lines.push("", "【改动边界】仅允许修改以下路径，越界改动将被回滚：", ...context.boundaryCodePaths.map((p) => `- ${p}`));
    }
    if (context.acceptanceCriteria && context.acceptanceCriteria.length > 0) {
      lines.push("", "【验收标准】", ...context.acceptanceCriteria.map((c) => `- ${c}`));
    }
    if (context.maxFiles) {
      lines.push("", `【文件数上限】最多改动 ${context.maxFiles} 个文件。`);
    }
    return lines.join("\n");
  }

  async getStatus(sessionId: string): Promise<CodingSessionStatus> {
    const state = this.sessions.get(sessionId);
    if (!state) return { status: "failed", finishedAt: "", exitCode: 1, error: "session not found" };
    if (state.cancelled) {
      return { status: "cancelled", finishedAt: new Date().toISOString() };
    }
    const res = await this.httpFn("GET", `/api/conversations/${sessionId}`);
    const rawStatus = String((res.data as Record<string, unknown> | null)?.execution_status ?? "").toLowerCase();
    const mapped = EXECUTION_STATUS_MAP[rawStatus] ?? "running";
    if (mapped === "completed") {
      return { status: "completed", finishedAt: new Date().toISOString(), exitCode: 0 };
    }
    if (mapped === "failed") {
      return { status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, error: `execution_status=${rawStatus}` };
    }
    return { status: "running", startedAt: new Date().toISOString() };
  }

  async getEvents(sessionId: string, since?: string): Promise<CodingAgentEvent[]> {
    const query: Record<string, unknown> = {};
    if (since) query.timestamp__gte = since;
    const res = await this.httpFn("GET", `/api/conversations/${sessionId}/events/search`, query);
    const page = (res.data as Record<string, unknown> | null) ?? {};
    const items = Array.isArray(page.items) ? page.items : [];
    const events: CodingAgentEvent[] = [];
    for (const item of items) {
      const ev = this.mapEvent(item as Record<string, unknown>);
      if (ev) events.push(ev);
    }
    return since ? events.filter((e) => e.timestamp > since) : events;
  }

  private mapEvent(item: Record<string, unknown>): CodingAgentEvent | null {
    const type = String(item.type ?? "");
    const timestamp = String(item.timestamp ?? new Date().toISOString());
    if (type === "ActionEvent") {
      const changedPaths = this.extractChangedPaths(item);
      const ev: CodingAgentEvent = { type: "tool_use", content: String(item.action ?? item.kind ?? ""), timestamp };
      if (changedPaths.length > 0) ev.changedPaths = changedPaths;
      return ev;
    }
    if (type === "ObservationEvent") {
      return { type: "tool_result", content: this.extractObservationText(item), timestamp };
    }
    if (type === "MessageEvent") {
      return { type: "text", content: this.extractMessageText(item), timestamp };
    }
    if (type === "ConversationErrorEvent") {
      return { type: "error", content: String(item.detail ?? item.code ?? ""), timestamp };
    }
    return null;
  }

  private extractChangedPaths(item: Record<string, unknown>): string[] {
    // ActionEvent.args 可能含 file_editor 的 path / create_file 的 path
    const args = (item.args ?? item.arguments) as Record<string, unknown> | undefined;
    const raw = args?.path ?? args?.file_path ?? args?.filename;
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
  }

  private extractObservationText(item: Record<string, unknown>): string {
    const content = item.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean).join("\n");
    }
    return String(item.message ?? "");
  }

  private extractMessageText(item: Record<string, unknown>): string {
    const content = item.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean).join("\n");
    }
    return String(item.message ?? "");
  }

  async cancel(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.cancelled = true;
    try {
      await this.httpFn("POST", `/api/conversations/${sessionId}/interrupt`, {});
    } catch {
      // agent-server 不可达时仅本地标记 cancelled（executor 仍可凭本地状态判定）
    }
  }

  async close(): Promise<void> {
    this.sessions.clear();
  }

  private createDefaultHttpFn(): HttpFn {
    const baseUrl = this.baseUrl;
    const apiKey = this.apiKey;
    return async (method, path, body) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-Session-API-Key"] = apiKey;
      let url = `${baseUrl}${path}`;
      let res: Response;
      if (method === "GET") {
        const qs = toQueryString(body);
        if (qs) url += `?${qs}`;
        res = await fetch(url, { method, headers });
      } else {
        res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      }
      const data = res.ok ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, data };
    };
  }
}

function toQueryString(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const entries = Object.entries(body as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return "";
  const params = new URLSearchParams();
  for (const [k, v] of entries) params.set(k, String(v));
  return params.toString();
}
