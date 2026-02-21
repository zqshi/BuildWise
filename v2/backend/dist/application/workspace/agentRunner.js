"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmInvocationError = exports.LlmUnavailableError = void 0;
exports.createAgentRunnerFromEnv = createAgentRunnerFromEnv;
exports.probeLlmRuntimeStatus = probeLlmRuntimeStatus;
class LlmUnavailableError extends Error {
    constructor(message = "LLM runner is unavailable") {
        super(message);
        this.code = "llm_unavailable";
        this.name = "LlmUnavailableError";
    }
}
exports.LlmUnavailableError = LlmUnavailableError;
class LlmInvocationError extends Error {
    constructor(message = "LLM invocation failed") {
        super(message);
        this.code = "llm_invocation_failed";
        this.name = "LlmInvocationError";
    }
}
exports.LlmInvocationError = LlmInvocationError;
class OpenAICompatibleAgentRunner {
    constructor(baseUrl, model, apiKey, timeoutMs = 60000, maxOutputTokens = 1200) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
        this.maxOutputTokens = maxOutputTokens;
    }
    async run(prompt) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
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
                    max_tokens: this.maxOutputTokens,
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
    const timeoutMsRaw = Number(env.LLM_REQUEST_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 60000;
    const maxTokensRaw = Number(env.LLM_MAX_OUTPUT_TOKENS);
    const maxOutputTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.floor(maxTokensRaw) : 1200;
    return new OpenAICompatibleAgentRunner(baseUrl, model, apiKey, timeoutMs, maxOutputTokens);
}
async function probeLlmRuntimeStatus(env, timeoutMs = 3000) {
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
    }
    catch (error) {
        return {
            configured: true,
            reachable: false,
            baseUrl,
            model,
            checkedAt,
            error: error instanceof Error ? error.message : "probe_failed"
        };
    }
    finally {
        clearTimeout(timer);
    }
}
