/**
 * Application-layer facade for LLM agent runner factory functions.
 *
 * 支持两种实现模式：
 * 1. OpenClaw Gateway（推荐，稳定可控）
 * 2. 直接 LLM（降级模式）
 */

import type { AgentRunner } from "../../domain/shared/agentRunner";

// ---------------------------------------------------------------------------
// 导出 OpenClaw Gateway 实现
// ---------------------------------------------------------------------------

export {
  createOpenClawGatewayRunner,
  type AgentId,
  getAgentDefinition,
  type SkillId,
  getSkillDefinition,
  executor as skillExecutor,
  type OpenClawGatewayError
} from "../workspace/agentRunnerFactoryGateway";

// ---------------------------------------------------------------------------
// 导出直接 LLM 实现（降级模式）
// ---------------------------------------------------------------------------

export {
  createAgentRunnerFromEnv,
  probeLlmRuntimeStatus
} from "../../infrastructure/llm/agentRunnerFactory";

// ---------------------------------------------------------------------------
// 工厂函数：根据环境选择实现
// ---------------------------------------------------------------------------

export function createAgentRunnerFromEnvOrFallback(): AgentRunner | null {
  const useGateway = process.env.USE_OPENCLAW_GATEWAY === "1" || true;

  if (useGateway) {
    // 优先使用 OpenClaw Gateway
    const gatewayRunner = createOpenClawGatewayRunner();
    if (gatewayRunner) {
      console.log("[agent-runner-factory] Using OpenClaw Gateway Agent Runner");
      return gatewayRunner;
    }
  }

  // 降级到直接 LLM
  console.log("[agent-runner-factory] Fallback to direct LLM Agent Runner");
  return createAgentRunnerFromEnv();
}
