/**
 * AgentRunner — Application-layer facade
 *
 * 提供统一的 Agent 运行接口，支持多种实现模式：
 * 1. OpenClaw Gateway 模式（推荐）- 稳定可控
 * 2. 直接 LLM 模式（降级）- 快速但不稳定
 *
 * 通过环境变量 USE_OPENCLAW_GATEWAY 控制使用哪种模式。
 */

export type {
  AgentRunner,
  AgentRunResult,
  AgentRunOptions,
  ConversationMessage,
  LlmRuntimeStatus,
  GatewayCapableRunner
} from "../../domain/shared/agentRunner";

export {
  LlmUnavailableError,
  LlmInvocationError,
  isGatewayCapableRunner
} from "../../domain/shared/agentRunner";

// 导出工厂函数（保持向后兼容）
export { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from "../shared/agentRunnerFactory";

// 导出 OpenClaw Gateway 版本
export {
  createAgentRunnerFromEnv as createOpenClawGatewayRunner,
  type AgentId,
  getAgentDefinition,
  type SkillId,
  getSkillDefinition,
  executor as skillExecutor,
  type OpenClawGatewayError
} from "../shared/agentRunnerFactory";
