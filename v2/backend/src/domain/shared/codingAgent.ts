/**
 * CodingAgentAdapter — 编码 Agent 统一端口
 *
 * 参照 arc `backend/src/arc/application/agent/adapter.py` 的 CodingAgentAdapter ABC。
 *
 * 与 AgentRunner（LLM 单次对话，管教练引导）并存不替代：
 * - AgentRunner：同步单次 LLM 调用，用于对话教练、交付物文本合成
 * - CodingAgentAdapter：异步会话式编码执行，用于代码改写（start → 轮询 → 拉取事件 → 事后校验）
 *
 * 声明+运行时分离：domain 定义端口，infrastructure 实现具体适配器（OpenClaw/Claude Code/Cursor 等），
 * 业务层只依赖此端口，通过 AgentRegistry.create(type) 获取实例，更换框架不影响业务。
 *
 * domain 层零外部依赖，仅定义接口与类型。
 */

// ── 启动编码任务的输入 ──

export type CodingTaskRole = "delivery-engineer" | "frontend-developer" | "backend-developer";

export type CodingTaskContext = {
  /** 工作目录（git 仓库本地路径），agent 在此目录内改代码 */
  repoPath: string;
  /** 改写指令（自然语言，来自用户输入） */
  instruction: string;
  /** 边界白名单：agent 改动路径必须在此范围内，越界改动由调用方事后校验回滚 */
  boundaryCodePaths: string[];
  /** 角色限定（影响候选文件筛选） */
  role?: CodingTaskRole;
  /** 验收标准（作为硬约束传给 agent） */
  acceptanceCriteria?: string[];
  /** 最多改动的文件数 */
  maxFiles?: number;
};

// ── 任务状态 ──

export type CodingSessionStatus =
  | { status: "running"; startedAt: string }
  | { status: "completed"; finishedAt: string; exitCode: number }
  | { status: "failed"; finishedAt: string; exitCode: number; error: string }
  | { status: "cancelled"; finishedAt: string };

// ── 事件流（agent 执行过程中产生的增量事件） ──

export type CodingAgentEventType = "tool_use" | "tool_result" | "text" | "error" | "diff";

export type CodingAgentEvent = {
  type: CodingAgentEventType;
  content: string;
  timestamp: string;
  /** diff 事件：本次事件改动的文件路径（相对 repoPath） */
  changedPaths?: string[];
};

// ── 端口接口 ──

export interface CodingAgentAdapter {
  /** 适配器类型标识（如 "claude-code-cli"、"openclaw-gateway"） */
  readonly agentType: string;
  /** 是否已实现且可用（未实现的不注册到 registry） */
  readonly implemented: boolean;
  /** 启动编码任务，返回外部会话 ID */
  start(context: CodingTaskContext): Promise<{ sessionId: string }>;
  /** 查询会话当前状态 */
  getStatus(sessionId: string): Promise<CodingSessionStatus>;
  /** 拉取自 since 之后的增量事件 */
  getEvents(sessionId: string, since?: string): Promise<CodingAgentEvent[]>;
  /** 取消正在运行的会话 */
  cancel(sessionId: string): Promise<void>;
  /** 释放底层资源（进程池/连接等） */
  close(): Promise<void>;
}

// ── 能力检测 ──

/**
 * 判断一个对象是否是可用的 CodingAgentAdapter（implemented=true）。
 * 用接口形态检测而非 instanceof，沿用 isGatewayCapableRunner 模式。
 */
export function isCodingAgentAvailable(adapter: unknown): adapter is CodingAgentAdapter {
  if (adapter === null || typeof adapter !== "object") return false;
  const a = adapter as Partial<CodingAgentAdapter>;
  return (
    typeof a.agentType === "string" &&
    a.agentType.length > 0 &&
    a.implemented === true &&
    typeof a.start === "function" &&
    typeof a.getStatus === "function" &&
    typeof a.getEvents === "function" &&
    typeof a.cancel === "function" &&
    typeof a.close === "function"
  );
}
