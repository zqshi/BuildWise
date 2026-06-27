/**
 * OpenHandsAdapter — 调用 OpenHands agent-server（HTTP REST）的编码 Agent 适配器
 *
 * 实现 CodingAgentAdapter 端口，对称 ClaudeCodeCliAdapter（后者调 claude CLI 子进程，本适配器调常驻 agent-server REST）。
 * 通过 POST /conversations 启动会话（workspace.working_dir=repoPath，initial_message 含 instruction + 边界声明），
 * POST /conversations/{id}/run 触发执行，GET /conversations/{id} 轮询状态，GET /events/search 拉取事件，
 * POST /interrupt 取消。agent 在 repoPath 内真实改代码，BuildWise 事后用 git diff + 边界校验（executor 层）。
 *
 * 声明+运行时分离：业务层通过 AgentRegistry.create("openhands") 获取实例，不直接 import 本类。
 * 依赖注入 httpFn：生产用 fetch wrapper（闭包持有 baseUrl），测试用 mock 注入伪响应。
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

const EXECUTION_STATUS_MAP: Record<string, CodingSessionStatus["status"]> = {
  RUNNING: "running",
  FINISHED: "completed",
  ERROR: "failed",
  STUCK: "failed",
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
      initial_message: this.buildInitialMessage(context),
      agent: {
        llm: {
          base_url: this.llm.baseUrl,
          api_key: this.llm.apiKey,
          model: this.llm.model,
        },
      },
      runtime: "remote",
      workspace: { working_dir: context.repoPath },
    };
    const res = await this.httpFn("POST", "/conversations", body);
    const conversationId = String((res.data as Record<string, unknown> | null)?.conversation_id ?? "");
    if (!conversationId) {
      throw new Error("OpenHands start failed: missing conversation_id");
    }
    this.sessions.set(conversationId, { conversationId, cancelled: false });
    await this.httpFn("POST", `/conversations/${conversationId}/run`, {});
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
    const res = await this.httpFn("GET", `/conversations/${sessionId}`);
    const rawStatus = String((res.data as Record<string, unknown> | null)?.execution_status ?? "").toUpperCase();
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
    const body: Record<string, unknown> = { conversation_id: sessionId };
    if (since) body.timestamp__gte = since;
    const res = await this.httpFn("GET", "/events/search", body);
    const items = Array.isArray(res.data) ? res.data : [];
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
      const ev: CodingAgentEvent = { type: "tool_use", content: String(item.action ?? ""), timestamp };
      if (changedPaths.length > 0) ev.changedPaths = changedPaths;
      return ev;
    }
    if (type === "ObservationEvent") {
      return { type: "tool_result", content: String(item.message ?? ""), timestamp };
    }
    if (type === "MessageEvent") {
      return { type: "text", content: String(item.message ?? ""), timestamp };
    }
    if (type === "AgentErrorEvent") {
      return { type: "error", content: String(item.error ?? ""), timestamp };
    }
    return null;
  }

  private extractChangedPaths(item: Record<string, unknown>): string[] {
    const args = item.args as Record<string, unknown> | undefined;
    const raw = args?.path ?? args?.file_path;
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
  }

  async cancel(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.cancelled = true;
    try {
      await this.httpFn("POST", "/interrupt", { conversation_id: sessionId });
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
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
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
