/**
 * AgentRunner — Application-layer facade
 *
 * 统一的 Agent 运行接口，基于直接 LLM 调用（OpenAI/Anthropic 兼容）。
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

// 工厂函数和运行时探测
export {
  createAgentRunnerFromEnv,
  probeLlmRuntimeStatus
} from "../../infrastructure/llm/agentRunnerFactory";
