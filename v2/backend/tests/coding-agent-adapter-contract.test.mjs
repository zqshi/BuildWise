import test from "node:test";
import assert from "node:assert/strict";

const { AgentRegistry } = await import("../dist/infrastructure/agent/agentRegistry.js");
const { isCodingAgentAvailable } = await import("../dist/domain/shared/codingAgent.js");

// ─── Mock CodingAgentAdapter（实现完整契约）───

function createMockAdapter({ agentType = "mock-agent", implemented = true } = {}) {
  const sessions = new Map();
  let closed = false;
  return {
    agentType,
    implemented,
    async start(context) {
      const sessionId = `sess-${sessions.size + 1}`;
      sessions.set(sessionId, { context, status: "running", events: [] });
      return { sessionId };
    },
    async getStatus(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return { status: "failed", finishedAt: "", exitCode: 1, error: "session not found" };
      if (s.status === "running") return { status: "running", startedAt: "" };
      return { status: s.status, finishedAt: "" };
    },
    async getEvents(sessionId) {
      return sessions.get(sessionId)?.events ?? [];
    },
    async cancel(sessionId) {
      const s = sessions.get(sessionId);
      if (s) s.status = "cancelled";
    },
    async close() {
      closed = true;
    },
    _isClosed: () => closed,
    _sessions: sessions,
  };
}

// ─── AgentRegistry 行为 ───

test("register + create 返回适配器实例", () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter());
  const adapter = registry.create("mock");
  assert.equal(adapter.agentType, "mock-agent");
  assert.equal(adapter.implemented, true);
});

test("create 未注册类型抛错并列出可用类型", () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter());
  assert.throws(
    () => registry.create("nonexistent"),
    /'nonexistent' is not registered.*Available: mock/
  );
});

test("availableAgents 列出已注册类型（不创建实例）", () => {
  const registry = new AgentRegistry();
  assert.deepEqual(registry.availableAgents(), []);
  registry.register("claude-code-cli", () => createMockAdapter({ agentType: "claude-code-cli" }));
  registry.register("openclaw-gateway", () => createMockAdapter({ agentType: "openclaw-gateway" }));
  assert.deepEqual(registry.availableAgents().sort(), ["claude-code-cli", "openclaw-gateway"]);
});

test("isAvailable 判断是否注册（不校验 implemented）", () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter());
  assert.equal(registry.isAvailable("mock"), true);
  assert.equal(registry.isAvailable("other"), false);
});

test("create implemented=false 的适配器抛错", () => {
  const registry = new AgentRegistry();
  registry.register("unimplemented", () => createMockAdapter({ implemented: false }));
  assert.throws(
    () => registry.create("unimplemented"),
    /registered but not available.*implemented=false/
  );
});

test("register 空 type 抛错", () => {
  const registry = new AgentRegistry();
  assert.throws(() => registry.register("", () => createMockAdapter()), /non-empty/);
  assert.throws(() => registry.register("   ", () => createMockAdapter()), /non-empty/);
});

test("同 type 重复注册覆盖旧值", () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter({ agentType: "v1" }));
  registry.register("mock", () => createMockAdapter({ agentType: "v2" }));
  assert.equal(registry.availableAgents().length, 1);
  assert.equal(registry.create("mock").agentType, "v2");
});

// ─── Mock adapter 完整契约：start → getStatus → getEvents → cancel → close ───

test("适配器完整契约：start→getStatus→getEvents→cancel→close 可正常调用", async () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter());
  const adapter = registry.create("mock");

  const { sessionId } = await adapter.start({
    repoPath: "/tmp/repo",
    instruction: "把按钮文案改成「提交」",
    boundaryCodePaths: ["src/Button.tsx"],
    role: "frontend-developer",
    acceptanceCriteria: ["按钮文案为「提交」"],
    maxFiles: 3,
  });
  assert.match(sessionId, /^sess-/);

  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "running");

  const events = await adapter.getEvents(sessionId);
  assert.ok(Array.isArray(events));

  await adapter.cancel(sessionId);
  const cancelledStatus = await adapter.getStatus(sessionId);
  assert.equal(cancelledStatus.status, "cancelled");

  await adapter.close();
  assert.equal(adapter._isClosed(), true);
});

// ─── isCodingAgentAvailable 能力检测 ───

test("isCodingAgentAvailable: implemented=true 且方法齐全 → true", () => {
  assert.equal(isCodingAgentAvailable(createMockAdapter()), true);
});

test("isCodingAgentAvailable: implemented=false → false", () => {
  assert.equal(isCodingAgentAvailable(createMockAdapter({ implemented: false })), false);
});

test("isCodingAgentAvailable: 缺方法 / 非对象 → false", () => {
  assert.equal(isCodingAgentAvailable(null), false);
  assert.equal(isCodingAgentAvailable({}), false);
  assert.equal(isCodingAgentAvailable({ agentType: "x", implemented: true }), false);
});

// ─── 声明+运行时分离验证：业务层只依赖端口，不 import 具体实现 ───

test("声明+运行时分离：registry.create 返回的对象满足 CodingAgentAdapter 端口", async () => {
  const registry = new AgentRegistry();
  registry.register("mock", () => createMockAdapter({ agentType: "any-framework" }));
  const adapter = registry.create("mock");
  // 业务层只用端口方法，不关心具体是哪个框架
  assert.equal(isCodingAgentAvailable(adapter), true);
  assert.equal(typeof adapter.start, "function");
  assert.equal(typeof adapter.getStatus, "function");
  assert.equal(typeof adapter.getEvents, "function");
  assert.equal(typeof adapter.cancel, "function");
  assert.equal(typeof adapter.close, "function");
});
