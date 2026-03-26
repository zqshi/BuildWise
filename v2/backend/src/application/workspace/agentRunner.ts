/**
 * AgentRunner — Application-layer facade
 *
 * Re-exports domain-level interfaces / types and shared factory functions
 * so that existing consumers keep working without any code changes.
 * No direct infrastructure imports — factory re-exports go through
 * application/shared/agentRunnerFactory.ts bridge.
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

export { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from "../shared/agentRunnerFactory";
