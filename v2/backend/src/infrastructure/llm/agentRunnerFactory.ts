import type { IterationAgentPrompt } from "../../domain/workspace/types";
import type { AgentRunner, AgentRunResult, AgentRunOptions, LlmRuntimeStatus } from "../../domain/shared/agentRunner";
import { createLogger } from "../runtime/logger";
import { resolveErrorMessage } from "../../shared/utils";
import {
  anthropicMessagesEndpoint,
  resolveApiKey,
  resolveBaseUrl,
  resolveLlmProvider,
  resolveModel,
  type LlmEnv
} from '../../application/workspace/shared/agentRunnerConfig';
const log = createLogger("llm-run");

// ── In-memory LLM call stats ring buffer ──

type LlmCallRecord = {
  ts: string;
  model: string;
  role: string;
  agentId: string;
  latencyMs: number;
  status: "ok" | "error" | "retry";
  error?: string;
  truncated?: boolean;
};

const LLM_STATS_MAX = 200;
const llmCallRecords: LlmCallRecord[] = [];

function recordLlmCall(record: LlmCallRecord) {
  llmCallRecords.push(record);
  if (llmCallRecords.length > LLM_STATS_MAX) {
    llmCallRecords.splice(0, llmCallRecords.length - LLM_STATS_MAX);
  }
}

export function getLlmCallStats(limit = 50): {
  records: LlmCallRecord[];
  summary: { total: number; errors: number; retries: number; avgLatencyMs: number };
} {
  const records = llmCallRecords.slice(-limit);
  const total = llmCallRecords.length;
  const errors = llmCallRecords.filter((r) => r.status === "error").length;
  const retries = llmCallRecords.filter((r) => r.status === "retry").length;
  const latencies = llmCallRecords.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);
  const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return { records, summary: { total, errors, retries, avgLatencyMs } };
}

/**
 * Retry a fetch-based LLM call once on transient failures (5xx, network error, timeout).
 * Uses a fixed 1.5s backoff before the retry attempt.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = resolveErrorMessage(error);
    const isTransient =
      msg.includes("llm_http_5") ||
      msg.includes("AbortError") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("network");
    if (!isTransient) throw error;
    log.warn("llm-retry", { label, error: msg });
    recordLlmCall({ ts: new Date().toISOString(), model: "", role: label, agentId: "", latencyMs: 0, status: "retry", error: msg });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fn();
  }
}

class OpenAICompatibleAgentRunner implements AgentRunner {
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
      const modelToUse = options?.modelOverride?.trim() || this.model;
      log.info("start", { model: modelToUse, role: prompt.role, agentId: prompt.agentId });
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
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: userContent }
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
}

class AnthropicCompatibleAgentRunner implements AgentRunner {
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
    const imageDataUrls = Array.isArray(options?.imageDataUrls)
      ? options?.imageDataUrls.map((item) => item.trim()).filter(Boolean).slice(0, 2)
      : [];
    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt.userPrompt }];
    for (const dataUrl of imageDataUrls) {
      const parsed = this.parseDataUrl(dataUrl);
      if (!parsed) {
        continue;
      }
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.data
        }
      });
    }
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
      const payload = (await response.json()) as {
        model?: string;
        stop_reason?: string;
        content?: Array<{ type?: string; text?: string; thinking?: string }>;
      };
      const blocks = Array.isArray(payload.content) ? payload.content : [];
      const textBlocks = blocks
        .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
        .filter(Boolean);
      const fallbackThinking = blocks
        .map((item) => (typeof item.thinking === "string" ? item.thinking.trim() : ""))
        .filter(Boolean);
      const content = (textBlocks[0] || fallbackThinking[0] || "").trim();
      if (!content) {
        throw new Error("llm_empty_content");
      }
      const finishReason = payload.stop_reason || undefined;
      return {
        content,
        model: payload.model || modelToUse,
        finishReason,
        truncated: finishReason === "max_tokens"
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAgentRunnerFromEnv(env: LlmEnv): AgentRunner | null {
  const provider = resolveLlmProvider(env);

  const baseUrl = resolveBaseUrl(env);
  if (!baseUrl) {
    return null;
  }
  const model = resolveModel(env);
  const apiKey = resolveApiKey(env);
  const timeoutMsRaw = Number(env.LLM_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 60000;
  const maxTokensRaw = Number(env.LLM_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.floor(maxTokensRaw) : 4096;
  const inner: AgentRunner = provider === "anthropic-compatible"
    ? new AnthropicCompatibleAgentRunner(baseUrl, model, apiKey, timeoutMs, maxOutputTokens)
    : new OpenAICompatibleAgentRunner(baseUrl, model, apiKey, timeoutMs, maxOutputTokens);

  return {
    run: (prompt, options) => withRetry(() => inner.run(prompt, options), `run:${prompt.role}`),
    runWithHistory: (sys, msgs, options) => withRetry(() => inner.runWithHistory(sys, msgs, options), "runWithHistory")
  };
}

export async function probeLlmRuntimeStatus(env: LlmEnv, timeoutMs = 30000): Promise<LlmRuntimeStatus> {
  const provider = resolveLlmProvider(env);
  const checkedAt = new Date().toISOString();

  const baseUrl = resolveBaseUrl(env);
  const model = resolveModel(env);
  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      baseUrl: "",
      model,
      checkedAt,
      error: "LLM_API_BASE is not configured"
    };
  }
  const apiKey = resolveApiKey(env) || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res =
      provider === "anthropic-compatible"
        ? await fetch(anthropicMessagesEndpoint(baseUrl), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
              ...(apiKey ? { "x-api-key": apiKey } : {})
            },
            body: JSON.stringify({
              model,
              max_tokens: 1,
              messages: [{ role: "user", content: "ping" }]
            }),
            signal: controller.signal
          })
        : await fetch(`${baseUrl}/models`, {
            method: "GET",
            headers: {
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            },
            signal: controller.signal
          });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        configured: true,
        reachable: false,
        baseUrl,
        model,
        checkedAt,
        error: `http_${res.status}${text ? `:${text.slice(0, 120)}` : ""}`
      };
    }
    return {
      configured: true,
      reachable: true,
      baseUrl,
      model,
      checkedAt,
      error: ""
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      baseUrl,
      model,
      checkedAt,
      error: error instanceof Error ? error.message : "probe_failed"
    };
  } finally {
    clearTimeout(timer);
  }
}
