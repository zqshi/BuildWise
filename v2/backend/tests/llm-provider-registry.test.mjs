import test from "node:test";
import assert from "node:assert/strict";

// 触发 agentRunnerFactory 模块加载（注册默认 2 provider 到 registry）
await import("../dist/infrastructure/llm/agentRunnerFactory.js");
const { registeredLlmProviders, resolveLlmRunner, registerLlmProvider } = await import(
  "../dist/infrastructure/llm/llmProviderRegistry.js"
);

// ─── 默认 provider 注册 ───

test("模块加载时默认注册 OpenAI 与 Anthropic 两 provider", () => {
  const providers = registeredLlmProviders();
  assert.ok(providers.includes("openai-compatible"), "应注册 openai-compatible");
  assert.ok(providers.includes("anthropic-compatible"), "应注册 anthropic-compatible");
});

test("resolveLlmRunner 未配置 baseUrl 时返回 null（factory 内部守卫）", () => {
  const runner = resolveLlmRunner("openai-compatible", {});
  assert.equal(runner, null);
});

test("resolveLlmRunner 未注册的 provider 返回 null", () => {
  const runner = resolveLlmRunner("nonexistent-provider", { LLM_API_BASE: "http://x" });
  assert.equal(runner, null);
});

// ─── 声明+运行时分离：可声明式扩展新 provider ───

test("registerLlmProvider 可扩展新 provider（如 custom-gateway），不改 createAgentRunnerFromEnv", () => {
  let factoryCalled = false;
  const fakeRunner = { run: async () => ({ content: "ok" }), runWithHistory: async () => ({ content: "ok" }) };
  registerLlmProvider("custom-gateway", (env) => {
    factoryCalled = true;
    return fakeRunner;
  });
  assert.ok(registeredLlmProviders().includes("custom-gateway"));

  const runner = resolveLlmRunner("custom-gateway", { LLM_API_BASE: "http://x" });
  assert.equal(factoryCalled, true);
  assert.equal(runner, fakeRunner);
});

test("registerLlmProvider 非 function factory 抛错", () => {
  assert.throws(() => registerLlmProvider("bad", null), /must be a function/);
});
