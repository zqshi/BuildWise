/**
 * Agent Runner Factory (OpenClaw Gateway 版本)
 *
 * 创建和配置 OpenClaw Gateway Agent Runner。
 */

import type { AgentRunner } from "../../../domain/shared/agentRunner";
import type { IterationAgentPrompt } from "../../../domain/workspace/types";
import { OpenClawAgentRunner } from "../../../infrastructure/openclaw/openclawAgentRunner";
import { createLogger } from "../../../infrastructure/runtime/logger";

const log = createLogger("agent-runner-factory-gateway");

// ---------------------------------------------------------------------------
// 创建 OpenClaw Gateway Agent Runner
// ---------------------------------------------------------------------------

export function createOpenClawGatewayRunner(): AgentRunner | null {
  try {
    log.info("Creating OpenClaw Gateway Agent Runner");

    const runner = new OpenClawAgentRunner();

    // 验证连通性
    runner.probe().then(result => {
      if (result.reachable) {
        log.info("OpenClaw Gateway Agent Runner created successfully", {
          baseUrl: result.baseUrl,
          model: result.model
        });
      } else {
        log.warn("OpenClaw Gateway not reachable", result.error);
      }
    }).catch(err => {
      log.error("Failed to probe OpenClaw Gateway", err);
    });

    return runner;
  } catch (error) {
    log.error("Failed to create OpenClaw Gateway Agent Runner", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 导出类型和工具函数
// ---------------------------------------------------------------------------

export type {
  AgentId,
  getAgentDefinition,
  type SkillId,
  getSkillDefinition
} from "../skillExecutor";

export {
  executor as skillExecutor
} from "../skillExecutor";

export type { OpenClawGatewayError } from "../../../infrastructure/openclaw/openclawGatewayClient";
// ---------------------------------------------------------------------------
// 类型导出（用于 TypeScript 类型推断）
// ---------------------------------------------------------------------------

// 导出供其他模块使用
export { type AgentRunner } from "../../../domain/shared/agentRunner";
