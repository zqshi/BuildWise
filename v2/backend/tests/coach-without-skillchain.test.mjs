import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalIteration } from "./helpers/mock-factories.mjs";

const { coachIterationConversationOp } = await import(
  "../dist/application/workspace/coach/coachOps.js"
);
const { LlmUnavailableError } = await import(
  "../dist/domain/shared/agentRunner.js"
);

// ─── 删除 Skill 死代码（openclawSkillsBridge/skillRegistry）后，Coach 引导链路不回归 ───
// Coach 引导现完全由 StageOrchestrator + stageAgents + replyGuard 承担，不再依赖 skillChain。

test("无 LLM 时抛中性错误（不再引用 skillChain，错误消息不含 openclaw）", async () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  repo._store.iterations.push(buildMinimalIteration(1, { id: 10 }));

  let caught = null;
  try {
    await coachIterationConversationOp(repo, null, 10, "你好，我想推进需求");
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "无 agentRunner 时应抛错而非静默返回");
  assert.ok(caught instanceof LlmUnavailableError, "应为 LlmUnavailableError");
  assert.equal(caught.code, "llm_unavailable");
  assert.match(caught.message, /llm_runtime_unavailable/);
  assert.doesNotMatch(caught.message, /openclaw/i, "错误消息应中性化，不含 openclaw 字样");
});

test("迭代不存在时返回 null（coachOps 模块完整可加载、无残留 skillChain 依赖）", async () => {
  const repo = createInMemoryWorkspaceRepo();
  const result = await coachIterationConversationOp(repo, null, 999, "你好");
  assert.equal(result, null);
});
