/**
 * agentRunnerFactory — LLM Runner 工厂 + 运行时探测 + provider 注册（本体 + re-export 桥接）
 *
 * 职责：
 * - createAgentRunnerFromEnv: 按 env 解析 provider 并构造 Runner，外层包 withRetry
 * - probeLlmRuntimeStatus: 探测 LLM 可达性
 * - 模块加载时注册默认 provider（openai-compatible / anthropic-compatible）
 *
 * 子模块（按职责拆分，单向依赖，无循环）：
 * - llmCallStats: 调用统计环形缓冲 + withRetry 重试
 * - openAiCompatibleRunner: OpenAI 兼容协议 Runner
 * - anthropicCompatibleRunner: Anthropic 兼容协议 Runner
 */

import type { AgentRunner, LlmRuntimeStatus } from "../../domain/shared/agentRunner";
import {
  anthropicMessagesEndpoint,
  resolveApiKey,
  resolveBaseUrl,
  resolveLlmProvider,
  resolveModel,
  type LlmEnv
} from './agentRunnerConfig';
import { registerLlmProvider, resolveLlmRunner } from './llmProviderRegistry';
import { OpenAICompatibleAgentRunner } from './openAiCompatibleRunner';
import { AnthropicCompatibleAgentRunner } from './anthropicCompatibleRunner';
import { withRetry } from './llmCallStats';

// re-export 供既有调用方继续从本文件 import（兼容层）
export { getLlmCallStats, recordLlmCall, withRetry } from './llmCallStats';
export type { LlmCallRecord } from './llmCallStats';
export { OpenAICompatibleAgentRunner } from './openAiCompatibleRunner';
export { AnthropicCompatibleAgentRunner } from './anthropicCompatibleRunner';

function resolveTimeoutMs(env: LlmEnv): number {
  const raw = Number(env.LLM_REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60000;
}

function resolveMaxOutputTokens(env: LlmEnv): number {
  const raw = Number(env.LLM_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4096;
}

// 注册默认 LLM provider（模块加载时）。未来加 provider 只需 registerLlmProvider，不改 createAgentRunnerFromEnv。
registerLlmProvider("openai-compatible", (env) => {
  const baseUrl = resolveBaseUrl(env);
  if (!baseUrl) return null;
  return new OpenAICompatibleAgentRunner(baseUrl, resolveModel(env), resolveApiKey(env), resolveTimeoutMs(env), resolveMaxOutputTokens(env));
});
registerLlmProvider("anthropic-compatible", (env) => {
  const baseUrl = resolveBaseUrl(env);
  if (!baseUrl) return null;
  return new AnthropicCompatibleAgentRunner(baseUrl, resolveModel(env), resolveApiKey(env), resolveTimeoutMs(env), resolveMaxOutputTokens(env));
});

export function createAgentRunnerFromEnv(env: LlmEnv): AgentRunner | null {
  const provider = resolveLlmProvider(env);
  const baseUrl = resolveBaseUrl(env);
  if (!baseUrl) {
    return null;
  }
  const inner = resolveLlmRunner(provider, env);
  if (!inner) {
    return null;
  }
  return {
    run: (prompt, options) => withRetry(() => inner.run(prompt, options), `run:${prompt.role}`),
    runWithHistory: (sys, msgs, options) => withRetry(() => inner.runWithHistory(sys, msgs, options), "runWithHistory")
  };
}

function buildProbeRequest(provider: string, baseUrl: string, model: string, apiKey: string, signal: AbortSignal): Promise<Response> {
  if (provider === "anthropic-compatible") {
    return fetch(anthropicMessagesEndpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}) },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal,
    });
  }
  return fetch(`${baseUrl}/models`, { method: "GET", headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, signal });
}

function buildProbeResult(configured: boolean, reachable: boolean, baseUrl: string, model: string, checkedAt: string, error: string): LlmRuntimeStatus {
  return { configured, reachable, baseUrl, model, checkedAt, error };
}

export async function probeLlmRuntimeStatus(env: LlmEnv, timeoutMs = 30000): Promise<LlmRuntimeStatus> {
  const provider = resolveLlmProvider(env);
  const checkedAt = new Date().toISOString();
  const baseUrl = resolveBaseUrl(env);
  const model = resolveModel(env);
  if (!baseUrl) return buildProbeResult(false, false, "", model, checkedAt, "LLM_API_BASE is not configured");

  const apiKey = resolveApiKey(env) || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await buildProbeRequest(provider, baseUrl, model, apiKey, controller.signal);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return buildProbeResult(true, false, baseUrl, model, checkedAt, `http_${res.status}${text ? `:${text.slice(0, 120)}` : ""}`);
    }
    return buildProbeResult(true, true, baseUrl, model, checkedAt, "");
  } catch (error) {
    return buildProbeResult(true, false, baseUrl, model, checkedAt, error instanceof Error ? error.message : "probe_failed");
  } finally {
    clearTimeout(timer);
  }
}
