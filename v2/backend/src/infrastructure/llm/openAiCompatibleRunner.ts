/**
 * OpenAI 兼容协议的 AgentRunner 实现 —— /chat/completions 端点，支持 system+user 消息与图片输入。
 */

import type { IterationAgentPrompt } from "../../domain/workspace/types";
import type { AgentRunner, AgentRunResult, AgentRunOptions } from "../../domain/shared/agentRunner";
import { createLogger } from "../runtime/logger";
import { resolveErrorMessage } from "../../shared/utils";
import { recordLlmCall } from "./llmCallStats";

const log = createLogger("llm-run");

export class OpenAICompatibleAgentRunner implements AgentRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly timeoutMs: number = 60000,
    private readonly maxOutputTokens: number = 4096
  ) {}

  async runWithHistory(systemPrompt: string, messages: Array<{ role: string; content: string }>, _options?: AgentRunOptions): Promise<AgentRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const modelToUse = this.model;
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: modelToUse,
          temperature: 0.2,
          max_tokens: this.maxOutputTokens,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content }))
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`llm_http_${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      const payload = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("llm_empty_content");
      }
      const finishReason = payload.choices?.[0]?.finish_reason || undefined;
      return { content, model: payload.model || modelToUse, finishReason, truncated: finishReason === "length" };
    } finally {
      clearTimeout(timer);
    }
  }

  async run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const modelToUse = options?.modelOverride?.trim() || this.model;
      const { body, headers } = this.buildOpenAIRequest(prompt, modelToUse, options);
      log.info("start", { model: modelToUse, role: prompt.role, agentId: prompt.agentId });
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST", headers, body, signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`llm_http_${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      const payload = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("llm_empty_content");
      }
      const finishReason = payload.choices?.[0]?.finish_reason || undefined;
      const latencyMs = Date.now() - startedAt;
      log.info("done", { model: payload.model || modelToUse, role: prompt.role, agentId: prompt.agentId, latencyMs });
      recordLlmCall({ ts: new Date().toISOString(), model: payload.model || modelToUse, role: prompt.role, agentId: prompt.agentId, latencyMs, status: "ok", truncated: finishReason === "length" });
      return {
        content,
        model: payload.model || modelToUse,
        finishReason,
        truncated: finishReason === "length"
      };
    } catch (error) {
      const message = resolveErrorMessage(error);
      const latencyMs = Date.now() - startedAt;
      log.info("fail", { role: prompt.role, agentId: prompt.agentId, latencyMs, error: message });
      recordLlmCall({ ts: new Date().toISOString(), model: options?.modelOverride || this.model, role: prompt.role, agentId: prompt.agentId, latencyMs, status: "error", error: message });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildOpenAIRequest(prompt: IterationAgentPrompt, modelToUse: string, options?: AgentRunOptions) {
    const imageDataUrls = Array.isArray(options?.imageDataUrls)
      ? options?.imageDataUrls.map((item) => item.trim()).filter(Boolean).slice(0, 2)
      : [];
    const userContent =
      imageDataUrls.length === 0
        ? prompt.userPrompt
        : [
            { type: "text", text: prompt.userPrompt },
            ...imageDataUrls.map((url) => ({
              type: "image_url",
              image_url: { url }
            }))
          ];
    return {
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: modelToUse,
        temperature: 0.2,
        max_tokens: this.maxOutputTokens,
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: userContent }
        ]
      })
    };
  }
}
