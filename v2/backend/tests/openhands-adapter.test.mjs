import test from "node:test";
import assert from "node:assert/strict";

const { OpenHandsAdapter } = await import(
  "../dist/infrastructure/agent/adapters/openHandsAdapter.js"
);
const { isCodingAgentAvailable } = await import("../dist/domain/shared/codingAgent.js");

// ─── T2: OpenHands adapter（HTTP REST，对齐 agent-server 真实 openapi 契约）───
//
// 真实契约（2026-06-28 实测 agent-server openapi）：
// - 鉴权 header：X-Session-API-Key
// - 创建：POST /api/conversations（StartConversationRequest，返回 {id}）
// - 执行：POST /api/conversations/{id}/run
// - 状态：GET /api/conversations/{id} → execution_status（ConversationExecutionStatus 枚举）
// - 事件：GET /api/conversations/{id}/events/search → EventPage {items[]}
// - 取消：POST /api/conversations/{id}/interrupt
//
// mock httpFn 注入：按 `${method} ${path}` 路由，返回预设 {ok, status, data}。
// GET 的 query 通过 body 传（real httpFn 内部转 query string），mock 不校验 query 细节。

function createMockHttp(routes) {
  const calls = [];
  return {
    calls,
    async fn(method, path, body) {
      calls.push({ method, path, body });
      const handler = routes[`${method} ${path}`];
      if (!handler) throw new Error(`unexpected ${method} ${path}`);
      const res = typeof handler === "function" ? handler(body) : handler;
      return { ok: res.ok ?? true, status: res.status ?? 200, data: res.data };
    },
  };
}

const ENV = {
  OPENHANDS_BASE_URL: "http://openhands:18000",
  OPENHANDS_API_KEY: "k",
  OPENHANDS_LLM_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  OPENHANDS_LLM_API_KEY: "glm-k",
  OPENHANDS_MODEL: "glm-4.5-air",
};

const REPO = "/tmp/demo-repo";

// ─── 端口契约 ───

test("OpenHandsAdapter 满足端口：agentType=openhands，implemented 基于 OPENHANDS_BASE_URL", () => {
  const mock = createMockHttp({});
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  assert.equal(adapter.agentType, "openhands");
  assert.equal(adapter.implemented, true);
  assert.equal(isCodingAgentAvailable(adapter), true);
});

test("未配 OPENHANDS_BASE_URL 时 implemented=false（不注册，T3 降级 fallback）", () => {
  const mock = createMockHttp({});
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: {} });
  assert.equal(adapter.implemented, false);
  assert.equal(isCodingAgentAvailable(adapter), false);
});

// ─── start：POST /api/conversations + POST /run ───

test("start：POST /api/conversations（body 含 working_dir/initial_message/agent.llm）+ POST /run", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-1" } },
    "POST /api/conversations/conv-1/run": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({
    repoPath: REPO,
    instruction: "把按钮文案改成提交",
    boundaryCodePaths: ["src/Button.tsx"],
    role: "frontend-developer",
  });
  assert.equal(sessionId, "conv-1", "sessionId 应来自 conversation id");

  const createCall = mock.calls.find((c) => c.method === "POST" && c.path === "/api/conversations");
  assert.ok(createCall, "应 POST /api/conversations");
  const body = createCall.body;
  assert.equal(body.workspace.working_dir, REPO, "working_dir 应为 repoPath");
  assert.ok(JSON.stringify(body.initial_message).includes("把按钮文案改成提交"), "initial_message 应含 instruction");
  assert.ok(JSON.stringify(body.initial_message).includes("src/Button.tsx"), "initial_message 应含边界声明");
  assert.equal(body.agent.llm.model, "glm-4.5-air", "agent.llm.model 应来自 OPENHANDS_MODEL");
  assert.equal(body.agent.llm.api_key, "glm-k", "agent.llm.api_key 应来自 OPENHANDS_LLM_API_KEY");

  assert.ok(
    mock.calls.some((c) => c.method === "POST" && c.path === "/api/conversations/conv-1/run"),
    "应 POST /api/conversations/{id}/run 启动执行"
  );
});

// ─── getStatus：execution_status 映射 ───

test("getStatus：running → running", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-2" } },
    "POST /api/conversations/conv-2/run": { data: {} },
    "GET /api/conversations/conv-2": { data: { execution_status: "running" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "running");
});

test("getStatus：finished → completed", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-3" } },
    "POST /api/conversations/conv-3/run": { data: {} },
    "GET /api/conversations/conv-3": { data: { execution_status: "finished" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "completed");
});

test("getStatus：error → failed", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-4" } },
    "POST /api/conversations/conv-4/run": { data: {} },
    "GET /api/conversations/conv-4": { data: { execution_status: "error" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "failed");
});

// ─── getEvents：EventPage.items 事件类型映射 ───

test("getEvents：ActionEvent→tool_use / ObservationEvent→tool_result / MessageEvent→text / ConversationErrorEvent→error", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-5" } },
    "POST /api/conversations/conv-5/run": { data: {} },
    "GET /api/conversations/conv-5/events/search": {
      data: {
        items: [
          { type: "ActionEvent", action: "file_editor", args: { path: "src/Button.tsx" }, timestamp: "2026-06-28T10:00:00Z" },
          { type: "ObservationEvent", content: "updated successfully", timestamp: "2026-06-28T10:00:01Z" },
          { type: "MessageEvent", content: "已改完", timestamp: "2026-06-28T10:00:02Z" },
          { type: "ConversationErrorEvent", code: "boom", detail: "出错了", timestamp: "2026-06-28T10:00:03Z" },
        ],
      },
    },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const events = await adapter.getEvents(sessionId);
  assert.ok(events.find((e) => e.type === "tool_use"), "应映射 ActionEvent→tool_use");
  assert.ok(events.find((e) => e.type === "tool_result"), "应映射 ObservationEvent→tool_result");
  assert.ok(events.find((e) => e.type === "text"), "应映射 MessageEvent→text");
  assert.ok(events.find((e) => e.type === "error"), "应映射 ConversationErrorEvent→error");
  const toolUse = events.find((e) => e.type === "tool_use");
  assert.ok(toolUse.changedPaths?.includes("src/Button.tsx"), "tool_use changedPaths 应含相对路径");
});

// ─── cancel + close ───

test("cancel：POST /api/conversations/{id}/interrupt + 本地标记 cancelled", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-6" } },
    "POST /api/conversations/conv-6/run": { data: {} },
    "POST /api/conversations/conv-6/interrupt": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await adapter.cancel(sessionId);
  assert.ok(
    mock.calls.some((c) => c.method === "POST" && /\/api\/conversations\/.*\/interrupt/.test(c.path)),
    "应 POST /api/conversations/{id}/interrupt"
  );
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "cancelled");
});

test("getStatus 不存在 sessionId 返回 failed", async () => {
  const mock = createMockHttp({});
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const status = await adapter.getStatus("nonexistent");
  assert.equal(status.status, "failed");
});

test("close 清理会话资源（close 后 getStatus 返回 failed）", async () => {
  const mock = createMockHttp({
    "POST /api/conversations": { data: { id: "conv-7" } },
    "POST /api/conversations/conv-7/run": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await adapter.close();
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "failed");
});
