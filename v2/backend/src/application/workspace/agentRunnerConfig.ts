export type LlmEnv = Record<string, string | undefined>;
export type LlmProvider = "openai-compatible" | "anthropic-compatible" | "openclaw";

export function resolveLlmProvider(env: LlmEnv): LlmProvider {
  const preferred = (env.LLM_PROVIDER || "").trim().toLowerCase();
  if (preferred === "openclaw") {
    return "openclaw";
  }
  if (preferred === "anthropic") {
    return "anthropic-compatible";
  }
  const anthropicBase = (env.ANTHROPIC_BASE_URL || "").trim();
  if (anthropicBase && !env.LLM_API_BASE?.trim()) {
    return "anthropic-compatible";
  }
  const base = (env.LLM_API_BASE || "").trim();
  if (base.includes("/anthropic")) {
    return "anthropic-compatible";
  }
  return "openai-compatible";
}

export function resolveBaseUrl(env: LlmEnv): string {
  const provider = resolveLlmProvider(env);
  const raw = provider === "anthropic-compatible" ? env.ANTHROPIC_BASE_URL || env.LLM_API_BASE || "" : env.LLM_API_BASE || "";
  return raw.trim().replace(/\/+$/, "");
}

export function resolveModel(env: LlmEnv): string {
  const provider = resolveLlmProvider(env);
  if (provider === "anthropic-compatible") {
    return (env.ANTHROPIC_MODEL || env.LLM_MODEL || "MiniMax-M2.5").trim();
  }
  return (env.LLM_MODEL || "gpt-4o-mini").trim();
}

export function resolveApiKey(env: LlmEnv): string | undefined {
  const provider = resolveLlmProvider(env);
  const raw = provider === "anthropic-compatible" ? env.ANTHROPIC_AUTH_TOKEN || env.LLM_API_KEY || "" : env.LLM_API_KEY || "";
  const normalized = raw.trim();
  return normalized || undefined;
}

export function anthropicMessagesEndpoint(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
}
