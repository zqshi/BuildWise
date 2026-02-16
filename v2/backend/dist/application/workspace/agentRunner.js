"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentRunnerFromEnv = createAgentRunnerFromEnv;
class OpenAICompatibleAgentRunner {
    constructor(baseUrl, model, apiKey) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
    }
    async run(prompt) {
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
            const payload = (await response.json());
            const content = payload.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error("llm_empty_content");
            }
            return {
                content,
                model: payload.model || this.model
            };
        }
        finally {
            clearTimeout(timer);
        }
    }
}
function createAgentRunnerFromEnv(env) {
    const baseUrlRaw = env.LLM_API_BASE?.trim();
    if (!baseUrlRaw) {
        return null;
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");
    const model = env.LLM_MODEL?.trim() || "gpt-4o-mini";
    const apiKey = env.LLM_API_KEY?.trim() || undefined;
    return new OpenAICompatibleAgentRunner(baseUrl, model, apiKey);
}
