import type { IterationAgentPrompt } from "../../domain/workspace/types";

type LlmEnv = Record<string, string | undefined>;

export type AgentRunResult = {
  content: string;
  model?: string;
};

export interface AgentRunner {
  run(prompt: IterationAgentPrompt): Promise<AgentRunResult>;
}

class OpenAICompatibleAgentRunner implements AgentRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string
  ) {}

  async run(prompt: IterationAgentPrompt): Promise<AgentRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: prompt.userPrompt }
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
  return new OpenAICompatibleAgentRunner(baseUrl, model, apiKey);
}

