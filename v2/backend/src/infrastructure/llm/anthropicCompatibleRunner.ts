/**
 * Anthropic 兼容协议的 AgentRunner 实现 —— /v1/messages 端点，支持 system 消息、多模态图片输入与 thinking 回退。
 */

import type { IterationAgentPrompt } from "../../domain/workspace/types";
import type { AgentRunner, AgentRunResult, AgentRunOptions } from "../../domain/shared/agentRunner";
import { anthropicMessagesEndpoint } from './agentRunnerConfig';

export class AnthropicCompatibleAgentRunner implements AgentRunner {
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
      const response = await fetch(anthropicMessagesEndpoint(this.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {})
        },
        body: JSON.stringify({
          model: modelToUse,
          temperature: 0.2,
          max_tokens: this.maxOutputTokens,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content }))
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`llm_http_${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      const payload = (await response.json()) as {
        model?: string;
        stop_reason?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
      const blocks = Array.isArray(payload.content) ? payload.content : [];
      const content = blocks.map((item) => (typeof item.text === "string" ? item.text.trim() : "")).filter(Boolean).join("\n").trim();
      if (!content) {
        throw new Error("llm_empty_content");
      }
      const finishReason = payload.stop_reason || undefined;
      return { content, model: payload.model || modelToUse, finishReason, truncated: finishReason === "max_tokens" };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    const matched = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!matched) {
      return null;
    }
    return {
      mediaType: matched[1],
      data: matched[2]
    };
  }

  async run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const userContent = this.buildAnthropicUserContent(prompt, options);
    try {
      const modelToUse = options?.modelOverride?.trim() || this.model;
      const response = await fetch(anthropicMessagesEndpoint(this.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {})
        },
        body: JSON.stringify({
          model: modelToUse,
          temperature: 0.2,
          max_tokens: this.maxOutputTokens,
          system: prompt.systemPrompt,
          messages: [{ role: "user", content: userContent }]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`llm_http_${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      return this.parseAnthropicResponse(await response.json(), modelToUse);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildAnthropicUserContent(prompt: IterationAgentPrompt, options?: AgentRunOptions): Array<Record<string, unknown>> {
    const imageDataUrls = Array.isArray(options?.imageDataUrls)
      ? options?.imageDataUrls.map((item) => item.trim()).filter(Boolean).slice(0, 2)
      : [];
    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt.userPrompt }];
    for (const dataUrl of imageDataUrls) {
      const parsed = this.parseDataUrl(dataUrl);
      if (!parsed) continue;
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType, data: parsed.data }
      });
    }
    return userContent;
  }

  private parseAnthropicResponse(json: unknown, modelToUse: string): AgentRunResult {
    const payload = json as {
      model?: string;
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string; thinking?: string }>;
    };
    const blocks = Array.isArray(payload.content) ? payload.content : [];
    const textBlocks = blocks.map((item) => (typeof item.text === "string" ? item.text.trim() : "")).filter(Boolean);
    const fallbackThinking = blocks.map((item) => (typeof item.thinking === "string" ? item.thinking.trim() : "")).filter(Boolean);
    const content = (textBlocks[0] || fallbackThinking[0] || "").trim();
    if (!content) throw new Error("llm_empty_content");
    const finishReason = payload.stop_reason || undefined;
    return { content, model: payload.model || modelToUse, finishReason, truncated: finishReason === "max_tokens" };
  }
}
