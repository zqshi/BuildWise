import { describe, test } from "node:test";
import assert from "node:assert/strict";

const {
  LlmUnavailableError,
  LlmInvocationError,
  createAgentRunnerFromEnv,
} = await import("../dist/application/workspace/agentRunner.js");

const {
  resolveLlmProvider,
  resolveBaseUrl,
  resolveModel,
  resolveApiKey,
  anthropicMessagesEndpoint,
} = await import("../dist/application/workspace/agentRunnerConfig.js");

// ─── 1. LlmUnavailableError ────────────────────────────────────────

describe("LlmUnavailableError", () => {
  test("code property is llm_unavailable", () => {
    const err = new LlmUnavailableError();
    assert.equal(err.code, "llm_unavailable");
  });

  test("name is LlmUnavailableError", () => {
    const err = new LlmUnavailableError();
    assert.equal(err.name, "LlmUnavailableError");
  });

  test("default message", () => {
    const err = new LlmUnavailableError();
    assert.equal(err.message, "LLM runner is unavailable");
  });

  test("custom message", () => {
    const err = new LlmUnavailableError("gateway down");
    assert.equal(err.message, "gateway down");
  });
});

// ─── 2. LlmInvocationError ─────────────────────────────────────────

describe("LlmInvocationError", () => {
  test("code property is llm_invocation_failed", () => {
    const err = new LlmInvocationError();
    assert.equal(err.code, "llm_invocation_failed");
  });

  test("name is LlmInvocationError", () => {
    const err = new LlmInvocationError();
    assert.equal(err.name, "LlmInvocationError");
  });

  test("default message", () => {
    const err = new LlmInvocationError();
    assert.equal(err.message, "LLM invocation failed");
  });

  test("custom message", () => {
    const err = new LlmInvocationError("timeout");
    assert.equal(err.message, "timeout");
  });
});

// ─── 3. createAgentRunnerFromEnv ────────────────────────────────────

describe("createAgentRunnerFromEnv", () => {
  test("empty env returns null", () => {
    assert.equal(createAgentRunnerFromEnv({}), null);
  });

  test("LLM_API_BASE set returns openai-compatible runner", () => {
    const runner = createAgentRunnerFromEnv({ LLM_API_BASE: "http://example.com/v1" });
    assert.notEqual(runner, null);
  });

  test("anthropic provider returns non-null runner", () => {
    const runner = createAgentRunnerFromEnv({
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_BASE_URL: "http://example.com",
    });
    assert.notEqual(runner, null);
  });

  test("openclaw provider returns non-null runner (default gateway)", () => {
    const runner = createAgentRunnerFromEnv({ LLM_PROVIDER: "openclaw" });
    assert.notEqual(runner, null);
  });

  test("returned runner has run and runWithHistory methods", () => {
    const runner = createAgentRunnerFromEnv({ LLM_API_BASE: "http://example.com/v1" });
    assert.equal(typeof runner.run, "function");
    assert.equal(typeof runner.runWithHistory, "function");
  });
});

// ─── 4. resolveLlmProvider ──────────────────────────────────────────

describe("resolveLlmProvider", () => {
  test("empty env defaults to openai-compatible", () => {
    assert.equal(resolveLlmProvider({}), "openai-compatible");
  });

  test("LLM_PROVIDER=openclaw returns openclaw", () => {
    assert.equal(resolveLlmProvider({ LLM_PROVIDER: "openclaw" }), "openclaw");
  });

  test("LLM_PROVIDER=anthropic returns anthropic-compatible", () => {
    assert.equal(resolveLlmProvider({ LLM_PROVIDER: "anthropic" }), "anthropic-compatible");
  });

  test("ANTHROPIC_BASE_URL without LLM_API_BASE returns anthropic-compatible", () => {
    assert.equal(
      resolveLlmProvider({ ANTHROPIC_BASE_URL: "http://x" }),
      "anthropic-compatible",
    );
  });

  test("LLM_API_BASE containing /anthropic returns anthropic-compatible", () => {
    assert.equal(
      resolveLlmProvider({ LLM_API_BASE: "http://x/anthropic" }),
      "anthropic-compatible",
    );
  });
});

// ─── 5. resolveBaseUrl ──────────────────────────────────────────────

describe("resolveBaseUrl", () => {
  test("strips trailing slash from LLM_API_BASE", () => {
    assert.equal(
      resolveBaseUrl({ LLM_API_BASE: "http://example.com/v1/" }),
      "http://example.com/v1",
    );
  });

  test("anthropic provider prefers ANTHROPIC_BASE_URL", () => {
    assert.equal(
      resolveBaseUrl({ ANTHROPIC_BASE_URL: "http://anthropic.com", LLM_PROVIDER: "anthropic" }),
      "http://anthropic.com",
    );
  });
});

// ─── 6. resolveModel ────────────────────────────────────────────────

describe("resolveModel", () => {
  test("empty env defaults to gpt-4o-mini", () => {
    assert.equal(resolveModel({}), "gpt-4o-mini");
  });

  test("LLM_MODEL overrides default", () => {
    assert.equal(resolveModel({ LLM_MODEL: "custom-model" }), "custom-model");
  });

  test("anthropic provider defaults to MiniMax-M2.5", () => {
    assert.equal(resolveModel({ LLM_PROVIDER: "anthropic" }), "MiniMax-M2.5");
  });
});

// ─── 7. resolveApiKey ───────────────────────────────────────────────

describe("resolveApiKey", () => {
  test("empty env returns undefined", () => {
    assert.equal(resolveApiKey({}), undefined);
  });

  test("LLM_API_KEY returns key", () => {
    assert.equal(resolveApiKey({ LLM_API_KEY: "sk-123" }), "sk-123");
  });

  test("anthropic provider uses ANTHROPIC_AUTH_TOKEN", () => {
    assert.equal(
      resolveApiKey({ LLM_PROVIDER: "anthropic", ANTHROPIC_AUTH_TOKEN: "token-1" }),
      "token-1",
    );
  });

  test("empty string LLM_API_KEY returns undefined", () => {
    assert.equal(resolveApiKey({ LLM_API_KEY: "" }), undefined);
  });
});

// ─── 8. anthropicMessagesEndpoint ───────────────────────────────────

describe("anthropicMessagesEndpoint", () => {
  test("base URL ending with /v1 appends /messages", () => {
    assert.equal(
      anthropicMessagesEndpoint("http://example.com/v1"),
      "http://example.com/v1/messages",
    );
  });

  test("base URL without /v1 appends /v1/messages", () => {
    assert.equal(
      anthropicMessagesEndpoint("http://example.com"),
      "http://example.com/v1/messages",
    );
  });
});
