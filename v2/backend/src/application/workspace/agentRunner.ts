import type { IterationAgentPrompt } from "../../domain/workspace/types";

type LlmEnv = Record<string, string | undefined>;

export type LlmRuntimeStatus = {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  model: string;
  checkedAt: string;
  error: string;
};

export type AgentRunResult = {
  content: string;
  model?: string;
};

export type AgentRunOptions = {
  imageDataUrls?: string[];
};

export class LlmUnavailableError extends Error {
  readonly code = "llm_unavailable";

  constructor(message = "LLM runner is unavailable") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmInvocationError extends Error {
  readonly code = "llm_invocation_failed";

  constructor(message = "LLM invocation failed") {
    super(message);
    this.name = "LlmInvocationError";
  }
}

export interface AgentRunner {
  run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult>;
}

class OpenAICompatibleAgentRunner implements AgentRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly timeoutMs: number = 60000,
    private readonly maxOutputTokens: number = 1200
  ) {}

  async run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const imageDataUrls = Array.isArray(options?.imageDataUrls)
        ? options!.imageDataUrls.map((item) => item.trim()).filter(Boolean).slice(0, 2)
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.model,
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
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("llm_empty_content");
      }
      return {
        content,
        model: payload.model || this.model
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAgentRunnerFromEnv(env: LlmEnv): AgentRunner | null {
  const baseUrlRaw = env.LLM_API_BASE?.trim();
  if (!baseUrlRaw) {
    return null;
  }
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const model = env.LLM_MODEL?.trim() || "gpt-4o-mini";
  const apiKey = env.LLM_API_KEY?.trim() || undefined;
  const timeoutMsRaw = Number(env.LLM_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 60000;
  const maxTokensRaw = Number(env.LLM_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.floor(maxTokensRaw) : 1200;
  return new OpenAICompatibleAgentRunner(baseUrl, model, apiKey, timeoutMs, maxOutputTokens);
}

export async function probeLlmRuntimeStatus(env: LlmEnv, timeoutMs = 3000): Promise<LlmRuntimeStatus> {
  const baseUrlRaw = env.LLM_API_BASE?.trim();
  const model = env.LLM_MODEL?.trim() || "gpt-4o-mini";
  const checkedAt = new Date().toISOString();
  if (!baseUrlRaw) {
    return {
      configured: false,
      reachable: false,
      baseUrl: "",
      model,
      checkedAt,
      error: "LLM_API_BASE is not configured"
    };
  }
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const apiKey = env.LLM_API_KEY?.trim() || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/models`, {
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
