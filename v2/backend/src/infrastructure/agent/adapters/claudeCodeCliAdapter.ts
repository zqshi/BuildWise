/**
 * ClaudeCodeCliAdapter — 调用 claude CLI 的编码 Agent 适配器
 *
 * 实现 CodingAgentAdapter 端口（参照 arc `adapters/claude_code.py`）。
 * 通过 `claude -p <instruction> --output-format stream-json --add-dir <repoPath>` 启动会话，
 * agent 在 repoPath 内真实改代码（file edit tool），BuildWise 事后用 git diff + 边界校验。
 *
 * 声明+运行时分离：业务层通过 AgentRegistry.create("claude-code-cli") 获取实例，
 * 不直接 import 本类。更换为 OpenClaw 等其他框架只需新写一个 adapter 注册到 registry。
 *
 * 依赖注入 spawnFn：生产用 child_process.spawn，测试用 mock 注入伪子进程。
 */

import { spawn } from "node:child_process";
import type {
  CodingAgentAdapter,
  CodingAgentEvent,
  CodingSessionStatus,
  CodingTaskContext,
} from "../../../domain/shared/codingAgent";

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => {
  pid?: number;
  stdout: { on: (event: string, cb: (chunk: Buffer) => void) => void };
  stderr: { on: (event: string, cb: (chunk: Buffer) => void) => void };
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  kill: (signal?: unknown) => void;
};

type SessionState = {
  proc: ReturnType<SpawnFn>;
  events: CodingAgentEvent[];
  status: CodingSessionStatus;
  cancelled: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

type AdapterOptions = {
  spawnFn?: SpawnFn;
  claudePath?: string;
  timeoutMs?: number;
};

const AGENT_TYPE = "claude-code-cli";
const DEFAULT_CLAUDE_PATH = "claude";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class ClaudeCodeCliAdapter implements CodingAgentAdapter {
  readonly agentType = AGENT_TYPE;
  readonly implemented = true;
  private readonly spawnFn: SpawnFn;
  private readonly claudePath: string;
  private readonly timeoutMs: number;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: AdapterOptions = {}) {
    // 真实 spawn 的 ChildProcess 类型签名（kill 参数为 number|Signals）比 SpawnFn 结构类型窄，
    // TS 参数逆变导致不兼容，用双重断言将 wrapper 转为 SpawnFn；mock 测试直接注入满足 SpawnFn 的对象。
    this.spawnFn = (options.spawnFn ?? ((cmd: string, args: string[], opts: { cwd: string }) => spawn(cmd, args, opts))) as unknown as SpawnFn;
    this.claudePath = options.claudePath ?? DEFAULT_CLAUDE_PATH;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async start(context: CodingTaskContext): Promise<{ sessionId: string }> {
    const args = this.buildArgs(context);
    const proc = this.spawnFn(this.claudePath, args, { cwd: context.repoPath });
    const sessionId = `claude-${proc.pid ?? Date.now()}`;
    const state: SessionState = {
      proc,
      events: [],
      status: { status: "running", startedAt: new Date().toISOString() },
      cancelled: false,
    };
    this.sessions.set(sessionId, state);
    this.attachListeners(state, context.repoPath);
    return { sessionId };
  }

  private buildArgs(context: CodingTaskContext): string[] {
    const args = [
      "-p", context.instruction,
      "--output-format", "stream-json",
      "--verbose", // claude -p + stream-json 必需，缺失则 exit=1 零输出
      "--permission-mode", "bypassPermissions", // headless 自动执行 Edit/Write，否则工具调用被权限确认阻断
      "--add-dir", context.repoPath,
    ];
    if (Array.isArray(context.boundaryCodePaths) && context.boundaryCodePaths.length > 0) {
      // 限制 agent 只能用编辑类工具，降低越权风险；最终边界由调用方事后 git diff 校验
      args.push("--allowedTools", "Edit", "Write", "MultiEdit", "NotebookEdit");
    }
    return args;
  }

  private attachListeners(state: SessionState, repoPath: string): void {
    let stdoutBuffer = "";
    state.proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      let newlineIdx: number;
      while ((newlineIdx = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIdx).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
        if (line) this.handleStreamLine(state, line, repoPath);
      }
    });
    state.proc.stderr.on("data", () => {
      // stderr 不作为事件，仅吞掉避免 unhandled；失败由 exit code 判定
    });
    const onExit = (...args: unknown[]) => this.finalizeSession(state, args[0] as number | null);
    state.proc.on("exit", onExit);
    state.proc.on("error", () => this.finalizeSession(state, 1));
    state.timer = setTimeout(() => {
      if (state.status.status === "running") {
        try { state.proc.kill("SIGTERM"); } catch { /* already exited */ }
      }
    }, this.timeoutMs);
  }

  private handleStreamLine(state: SessionState, line: string, repoPath: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // 非 JSON 行跳过
    }
    const event = this.mapStreamEvent(parsed as Record<string, unknown>, repoPath);
    if (event) state.events.push(event);
  }

  private mapStreamEvent(json: Record<string, unknown>, repoPath: string): CodingAgentEvent | null {
    const type = String(json.type ?? "");
    const timestamp = new Date().toISOString();
    if (type === "assistant") {
      return this.mapAssistantMessage(json, timestamp, repoPath);
    }
    if (type === "user") {
      // 真实 claude stream-json：tool_result 内嵌在 type:"user" 的 message.content 里
      return this.mapUserMessage(json, timestamp);
    }
    if (type === "result") {
      return { type: "text", content: String(json.result ?? ""), timestamp };
    }
    return null; // system/init 等不映射为业务事件
  }

  private mapAssistantMessage(json: Record<string, unknown>, timestamp: string, repoPath: string): CodingAgentEvent | null {
    const message = json.message as { content?: Array<Record<string, unknown>> } | undefined;
    const blocks = Array.isArray(message?.content) ? message.content : [];
    for (const block of blocks) {
      if (block.type === "tool_use") {
        const changedPaths = this.extractChangedPaths(block, repoPath);
        return { type: "tool_use", content: String(block.name ?? ""), timestamp, changedPaths };
      }
      if (block.type === "text" && typeof block.text === "string") {
        return { type: "text", content: block.text, timestamp };
      }
    }
    return null;
  }

  private extractChangedPaths(block: Record<string, unknown>, repoPath: string): string[] {
    const input = block.input as Record<string, unknown> | undefined;
    const raw = input?.file_path ?? input?.path ?? input?.notebook_path;
    if (typeof raw !== "string") return [];
    const rel = this.toRelPath(raw, repoPath);
    return rel ? [rel] : [];
  }

  private toRelPath(absOrRel: string, repoPath: string): string {
    const normalized = absOrRel.replace(/\\/g, "/");
    const repoNorm = repoPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized.startsWith(repoNorm + "/")) return normalized.slice(repoNorm.length + 1);
    if (normalized.startsWith("./")) return normalized.slice(2);
    return normalized;
  }

  private mapUserMessage(json: Record<string, unknown>, timestamp: string): CodingAgentEvent | null {
    const message = json.message as { content?: Array<Record<string, unknown>> } | undefined;
    const blocks = Array.isArray(message?.content) ? message.content : [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        return { type: "tool_result", content: this.extractToolResultText(block), timestamp };
      }
    }
    return null;
  }

  private extractToolResultText(json: Record<string, unknown>): string {
    const content = json.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.map((c) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean).join("\n");
  }

  private finalizeSession(state: SessionState, code: number | null): void {
    if (state.status.status !== "running") return;
    if (state.timer) clearTimeout(state.timer);
    const finishedAt = new Date().toISOString();
    if (state.cancelled) {
      state.status = { status: "cancelled", finishedAt };
    } else if (code === 0) {
      state.status = { status: "completed", finishedAt, exitCode: 0 };
    } else {
      state.status = { status: "failed", finishedAt, exitCode: code ?? 1, error: `claude exit code ${code}` };
    }
  }

  async getStatus(sessionId: string): Promise<CodingSessionStatus> {
    const state = this.sessions.get(sessionId);
    if (!state) return { status: "failed", finishedAt: "", exitCode: 1, error: "session not found" };
    return state.status;
  }

  async getEvents(sessionId: string, since?: string): Promise<CodingAgentEvent[]> {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    if (!since) return state.events;
    return state.events.filter((e) => e.timestamp > since);
  }

  async cancel(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    state.cancelled = true;
    if (state.status.status === "running") {
      try { state.proc.kill("SIGTERM"); } catch { /* already exited */ }
    }
    state.status = { status: "cancelled", finishedAt: new Date().toISOString() };
  }

  async close(): Promise<void> {
    for (const [, state] of this.sessions) {
      if (state.timer) clearTimeout(state.timer);
      if (state.status.status === "running") {
        try { state.proc.kill("SIGTERM"); } catch { /* ignore */ }
      }
    }
    this.sessions.clear();
  }
}
