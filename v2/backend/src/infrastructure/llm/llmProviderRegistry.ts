/**
 * LlmProviderRegistry — LLM Provider 注册表
 *
 * 与 CodingAgentAdapter 的 AgentRegistry 对称：编码 agent 可声明式切换，
 * LLM provider 同样可声明式扩展。当前注册 OpenAI/Anthropic 两协议，
 * 未来若某 LLM Gateway 需非标准 API，只需 registerLlmProvider 注册专用 factory，
 * 不改 createAgentRunnerFromEnv 逻辑。
 *
 * 声明+运行时分离：provider 类型与 factory 在 agentRunnerFactory.ts 注册，
 * 此处仅提供注册表机制。
 */

import type { AgentRunner } from "../../domain/shared/agentRunner";
import type { LlmEnv } from "./agentRunnerConfig";

export type LlmProviderFactory = (env: LlmEnv) => AgentRunner | null;

// key 用 string 而非 LlmProvider 联合类型：支持未来注册任意 provider（如 custom-gateway），
// LlmProvider 联合类型保留在 agentRunnerConfig 作已知默认，不限制注册表扩展。
const providers = new Map<string, LlmProviderFactory>();

/** 注册一个 LLM provider 工厂。同 provider 重复注册覆盖旧值。 */
export function registerLlmProvider(provider: string, factory: LlmProviderFactory): void {
  if (typeof factory !== "function") {
    throw new Error(`LLM provider factory for '${provider}' must be a function.`);
  }
  providers.set(provider, factory);
}

/** 按 provider 类型解析 runner 实例，未注册或配置不全返回 null。 */
export function resolveLlmRunner(provider: string, env: LlmEnv): AgentRunner | null {
  const factory = providers.get(provider);
  return factory ? factory(env) : null;
}

/** 列出已注册的 provider 类型（测试与可观测性用）。 */
export function registeredLlmProviders(): string[] {
  return Array.from(providers.keys());
}
