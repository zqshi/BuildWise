/**
 * OpenClaw AgentRunner Adapter
 *
 * Implements the AgentRunner interface by delegating to OpenClaw Gateway.
 * Drop-in replacement for OpenAICompatibleAgentRunner / AnthropicCompatibleAgentRunner.
 *
 * Session persistence: each `run()` call derives a session key from the prompt's
 * agentId + scope context. `runWithHistory()` uses a hash-based session key from
 * the system prompt to maintain conversation continuity.
 */

import type { IterationAgentPrompt } from "../../domain/workspace/types";
import { resolveErrorMessage } from "../../shared/utils";
import type {
  AgentRunner,
  AgentRunResult,
  AgentRunOptions,
  ConversationMessage
} from "../../application/workspace/agentRunner";
import { createLogger } from "../runtime/logger";
import {
  OpenClawGatewayClient,
  type OpenClawGatewayConfig,
  type GatewayChatMessage
} from "./openclawGatewayClient";

const log = createLogger("openclaw-run");

export class OpenClawAgentRunner implements AgentRunner {
  private readonly client: OpenClawGatewayClient;
  private readonly agentId: string;

  constructor(config: Partial<OpenClawGatewayConfig> & Pick<OpenClawGatewayConfig, "baseUrl">) {
    this.client = new OpenClawGatewayClient(config);
    this.agentId = config.defaultAgentId ?? "main";
  }

  async run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult> {
    const imageDataUrls = Array.isArray(options?.imageDataUrls)
      ? options.imageDataUrls.map((item) => item.trim()).filter(Boolean).slice(0, 2)
      : [];

    const userContent: GatewayChatMessage["content"] =
      imageDataUrls.length === 0
        ? prompt.userPrompt
        : [
            { type: "text", text: prompt.userPrompt },
            ...imageDataUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url }
            }))
          ];

    const messages: GatewayChatMessage[] = [
      { role: "system", content: prompt.systemPrompt },
      { role: "user", content: userContent }
    ];

    const sessionKey = this.deriveSessionKey(prompt, options);

    const traceEnabled = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LLM_TRACE || "").trim() === "1";
    const startedAt = Date.now();
    if (traceEnabled) {
      log.info("start", { role: prompt.role, agentId: prompt.agentId, session: sessionKey || "none" });
    }

    try {
      const result = await this.client.chat({
        messages,
        agentId: this.agentId,
        sessionKey: sessionKey || undefined
      });

      if (traceEnabled) {
        log.info("done", { role: prompt.role, agentId: prompt.agentId, latencyMs: Date.now() - startedAt });
      }

      return {
        content: result.content,
        model: result.model,
        finishReason: result.finishReason,
        truncated: result.truncated
      };
    } catch (error) {
      if (traceEnabled) {
        const message = resolveErrorMessage(error);
        log.info("fail", { role: prompt.role, agentId: prompt.agentId, latencyMs: Date.now() - startedAt, error: message });
      }
      throw error;
    }
  }

  async runWithHistory(systemPrompt: string, messages: ConversationMessage[], options?: AgentRunOptions): Promise<AgentRunResult> {
    const gatewayMessages: GatewayChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    // Dynamic agentId: sessionContext.agentId overrides default
    const ctx = options?.sessionContext;
    const effectiveAgentId = ctx?.agentId ? String(ctx.agentId) : this.agentId;

    // Prefer explicit session context from caller, else fallback to hash-based key
    const sessionKey = ctx?.conversationId
      ? OpenClawGatewayClient.deriveGlobalSessionKey(effectiveAgentId, ctx.conversationId)
      : ctx?.projectId
        ? OpenClawGatewayClient.deriveProjectSessionKey(effectiveAgentId, ctx.projectId)
        : `agent:${effectiveAgentId}:history-${simpleHash(systemPrompt)}`;

    const result = await this.client.chat({
      messages: gatewayMessages,
      agentId: effectiveAgentId,
      sessionKey
    });

    return {
      content: result.content,
      model: result.model,
      finishReason: result.finishReason,
      truncated: result.truncated
    };
  }

  /**
   * Probe the OpenClaw Gateway for reachability.
   */
  async probe(): Promise<{ reachable: boolean; error: string }> {
    return this.client.probe();
  }

  private deriveSessionKey(prompt: IterationAgentPrompt, options?: AgentRunOptions): string {
    const ctx = options?.sessionContext;

    // Explicit session context from caller takes priority
    if (ctx?.iterationId && ctx?.projectId) {
      return OpenClawGatewayClient.deriveSessionKey(this.agentId, ctx.projectId, ctx.iterationId);
    }
    if (ctx?.projectId) {
      return OpenClawGatewayClient.deriveProjectSessionKey(this.agentId, ctx.projectId);
    }
    if (ctx?.conversationId) {
      return OpenClawGatewayClient.deriveGlobalSessionKey(this.agentId, ctx.conversationId);
    }

    // Fallback: derive from prompt agentId pattern "agent-<role>-<N>"
    // These are typically single-shot analysis calls — no session needed.
    if (prompt.scope === "iteration" && prompt.agentId) {
      return `agent:${this.agentId}:${prompt.agentId}`;
    }
    return "";
  }
}

/**
 * Simple non-cryptographic hash for session key derivation.
 * Not security-sensitive — just needs to be deterministic and low-collision.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
