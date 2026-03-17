import test from "node:test";
import assert from "node:assert/strict";
import { OpenclawGlobalService } from "../src/application/openclawGlobal/openclawGlobalService.ts";

function createInMemoryRepo() {
  const store = {
    conversations: [],
    messages: [],
    skills: [],
    strategyState: {
      activeSkillIds: [],
      customWorkflowDescriptions: [],
      lastResetAt: null,
      updatedAt: new Date().toISOString()
    }
  };

  return {
    _store: store,
    listConversations() { return store.conversations; },
    findConversation(id) { return store.conversations.find((c) => c.id === id) || null; },
    createConversation(conv) { store.conversations.push(conv); return conv; },
    updateConversation(conv) {
      const idx = store.conversations.findIndex((c) => c.id === conv.id);
      if (idx >= 0) store.conversations[idx] = conv;
    },
    listMessages(conversationId) { return store.messages.filter((m) => m.conversationId === conversationId); },
    appendMessage(msg) { store.messages.push(msg); return msg; },
    listSkills() { return store.skills; },
    findSkill(id) { return store.skills.find((s) => s.id === id) || null; },
    saveSkill(skill) {
      const idx = store.skills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) { store.skills[idx] = skill; } else { store.skills.push(skill); }
      return skill;
    },
    removeSkill(id) {
      const idx = store.skills.findIndex((s) => s.id === id);
      if (idx >= 0) { store.skills.splice(idx, 1); return true; }
      return false;
    },
    getStrategyState() { return store.strategyState; },
    updateStrategyState(state) { store.strategyState = state; }
  };
}

function createMockAgentRunner(reply = "mock reply") {
  const calls = [];
  return {
    calls,
    run() { throw new Error("should not call run"); },
    async runWithHistory(systemPrompt, history) {
      calls.push({ systemPrompt, history });
      return { content: reply, model: "mock-model" };
    }
  };
}

test("createConversation persists and lists conversation", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  const conv = service.createConversation("测试对话");
  assert.equal(conv.title, "测试对话");
  assert.equal(conv.status, "active");
  const list = service.listConversations();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, conv.id);
});

test("createConversation uses default title when none provided", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  const conv = service.createConversation();
  assert.equal(conv.title, "新对话");
});

test("findConversation returns null for unknown id", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  assert.equal(service.findConversation("nonexistent"), null);
});

test("sendMessage persists user and assistant messages", async () => {
  const repo = createInMemoryRepo();
  const agentRunner = createMockAgentRunner("Agent 回复内容");
  const service = new OpenclawGlobalService(repo, agentRunner);
  const conv = service.createConversation("测试");
  const [userMsg, assistantMsg] = await service.sendMessage(conv.id, "你好");
  assert.equal(userMsg.role, "user");
  assert.equal(userMsg.content, "你好");
  assert.equal(userMsg.conversationId, conv.id);
  assert.equal(assistantMsg.role, "assistant");
  assert.equal(assistantMsg.content, "Agent 回复内容");
  assert.equal(assistantMsg.conversationId, conv.id);
  const messages = service.listMessages(conv.id);
  assert.equal(messages.length, 2);
});

test("sendMessage passes conversation history to agent runner", async () => {
  const repo = createInMemoryRepo();
  const agentRunner = createMockAgentRunner("回复1");
  const service = new OpenclawGlobalService(repo, agentRunner);
  const conv = service.createConversation("测试");
  await service.sendMessage(conv.id, "第一条");
  agentRunner.calls.length = 0;
  await service.sendMessage(conv.id, "第二条");
  assert.equal(agentRunner.calls.length, 1);
  const history = agentRunner.calls[0].history;
  assert.equal(history.length, 3);
  assert.equal(history[0].role, "user");
  assert.equal(history[0].content, "第一条");
  assert.equal(history[1].role, "assistant");
  assert.equal(history[2].role, "user");
  assert.equal(history[2].content, "第二条");
});

test("sendMessage without agent runner returns fallback message", async () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  const conv = service.createConversation("测试");
  const [, assistantMsg] = await service.sendMessage(conv.id, "你好");
  assert.ok(assistantMsg.content.includes("未配置 LLM 运行时"));
  assert.deepEqual(assistantMsg.metadata, { source: "no-agent-runner" });
});

test("sendMessage throws for unknown conversation", async () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  await assert.rejects(() => service.sendMessage("no-such-id", "你好"), /conversation_not_found/);
});

test("sendMessage handles agent runner error gracefully", async () => {
  const repo = createInMemoryRepo();
  const agentRunner = {
    run() { throw new Error("nope"); },
    async runWithHistory() { throw new Error("LLM 超时"); }
  };
  const service = new OpenclawGlobalService(repo, agentRunner);
  const conv = service.createConversation("测试");
  const [, assistantMsg] = await service.sendMessage(conv.id, "你好");
  assert.ok(assistantMsg.content.includes("LLM 超时"));
  assert.deepEqual(assistantMsg.metadata, { source: "agent-runner-error" });
});

test("activateSkill updates skill status and strategy state", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  repo.saveSkill({
    id: "skill-1", name: "测试Skill", description: "desc", sourceConversationId: "",
    content: "", status: "draft", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  const result = service.activateSkill("skill-1");
  assert.equal(result.status, "active");
  const state = service.getStrategyState();
  assert.ok(state.activeSkillIds.includes("skill-1"));
});

test("activateSkill returns null for unknown skill", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  assert.equal(service.activateSkill("nonexistent"), null);
});

test("deprecateSkill updates skill status and removes from strategy", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  repo.saveSkill({
    id: "skill-2", name: "Skill2", description: "desc", sourceConversationId: "",
    content: "", status: "active", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  service.activateSkill("skill-2");
  const result = service.deprecateSkill("skill-2");
  assert.equal(result.status, "deprecated");
  const state = service.getStrategyState();
  assert.ok(!state.activeSkillIds.includes("skill-2"));
});

test("restoreInitialConfig deprecates all skills and resets strategy", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  repo.saveSkill({
    id: "s1", name: "A", description: "", sourceConversationId: "",
    content: "", status: "active", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  repo.saveSkill({
    id: "s2", name: "B", description: "", sourceConversationId: "",
    content: "", status: "active", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  service.activateSkill("s1");
  service.activateSkill("s2");
  const state = service.restoreInitialConfig();
  assert.deepEqual(state.activeSkillIds, []);
  assert.ok(state.lastResetAt !== null);
  const skills = service.listSkills();
  assert.ok(skills.every((s) => s.status === "deprecated"));
});

test("listActiveSkills filters by status", () => {
  const repo = createInMemoryRepo();
  const service = new OpenclawGlobalService(repo, null);
  repo.saveSkill({
    id: "s1", name: "Active", description: "", sourceConversationId: "",
    content: "", status: "active", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  repo.saveSkill({
    id: "s2", name: "Deprecated", description: "", sourceConversationId: "",
    content: "", status: "deprecated", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });
  const active = service.listActiveSkills();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "s1");
});

test("sendMessage updates conversation updatedAt", async () => {
  const repo = createInMemoryRepo();
  const agentRunner = createMockAgentRunner("ok");
  const service = new OpenclawGlobalService(repo, agentRunner);
  const conv = service.createConversation("测试");
  const beforeUpdate = conv.updatedAt;
  await new Promise((r) => setTimeout(r, 10));
  await service.sendMessage(conv.id, "触发更新");
  const updated = service.findConversation(conv.id);
  assert.ok(updated.updatedAt >= beforeUpdate);
});
