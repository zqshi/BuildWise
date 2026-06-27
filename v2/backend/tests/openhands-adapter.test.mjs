import test from "node:test";
import assert from "node:assert/strict";

const { OpenHandsAdapter } = await import(
  "../dist/infrastructure/agent/adapters/openHandsAdapter.js"
);
const { isCodingAgentAvailable } = await import("../dist/domain/shared/codingAgent.js");

// ─── T2: OpenHands adapter（HTTP REST，对称 ClaudeCodeCliAdapter 的 spawnFn 注入）───
//
// mock httpFn 注入：按 `${method} ${path}` 精确路由，返回预设 {ok, status, data}。
// GET 的 query 通过 body 传（real httpFn 内部转 query string），mock 不关心 body 细节。

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
  OPENHANDS_BASE_URL: "http://openhands:3000",
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

// ─── start：POST /conversations（working_dir=repoPath + initial_message 含 instruction/边界）→ POST /run ───

test("start：POST /conversations + POST /conversations/{id}/run，body 含 repoPath/instruction/边界声明", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-1" } },
    "POST /conversations/conv-1/run": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({
    repoPath: REPO,
    instruction: "把按钮文案改成提交",
    boundaryCodePaths: ["src/Button.tsx"],
    role: "frontend-developer",
  });
  assert.match(sessionId, /conv-1/, "sessionId 应来自 conversation_id");

  const createCall = mock.calls.find((c) => c.method === "POST" && c.path === "/conversations");
  assert.ok(createCall, "应 POST /conversations");
  const bodyJson = JSON.stringify(createCall.body);
  assert.ok(bodyJson.includes(REPO), "body 应含 repoPath 作为工作目录");
  assert.ok(bodyJson.includes("把按钮文案改成提交"), "initial_message 应含 instruction");
  assert.ok(bodyJson.includes("src/Button.tsx"), "initial_message 应含边界声明");

  assert.ok(
    mock.calls.some((c) => c.method === "POST" && c.path === "/conversations/conv-1/run"),
    "应 POST /conversations/{id}/run 启动执行"
  );
});

// ─── getStatus：execution_status 映射 ───

test("getStatus：RUNNING→running", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-2" } },
    "POST /conversations/conv-2/run": { data: {} },
    "GET /conversations/conv-2": { data: { execution_status: "RUNNING" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "running");
});

test("getStatus：FINISHED→completed", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-3" } },
    "POST /conversations/conv-3/run": { data: {} },
    "GET /conversations/conv-3": { data: { execution_status: "FINISHED" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "completed");
});

test("getStatus：ERROR→failed", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-4" } },
    "POST /conversations/conv-4/run": { data: {} },
    "GET /conversations/conv-4": { data: { execution_status: "ERROR" } },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "failed");
});

// ─── getEvents：事件类型映射 ───

test("getEvents：ActionEvent→tool_use / ObservationEvent→tool_result / MessageEvent→text / AgentErrorEvent→error", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-5" } },
    "POST /conversations/conv-5/run": { data: {} },
    "GET /events/search": {
      data: [
        { type: "ActionEvent", action: "edit_file", args: { path: "src/Button.tsx" }, timestamp: "2026-06-27T10:00:00Z" },
        { type: "ObservationEvent", message: "updated successfully", timestamp: "2026-06-27T10:00:01Z" },
        { type: "MessageEvent", message: "已改完", timestamp: "2026-06-27T10:00:02Z" },
        { type: "AgentErrorEvent", error: "boom", timestamp: "2026-06-27T10:00:03Z" },
      ],
    },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const events = await adapter.getEvents(sessionId);
  assert.ok(events.find((e) => e.type === "tool_use"), "应映射 ActionEvent→tool_use");
  assert.ok(events.find((e) => e.type === "tool_result"), "应映射 ObservationEvent→tool_result");
  assert.ok(events.find((e) => e.type === "text"), "应映射 MessageEvent→text");
  assert.ok(events.find((e) => e.type === "error"), "应映射 AgentErrorEvent→error");
  const toolUse = events.find((e) => e.type === "tool_use");
  assert.ok(toolUse.changedPaths?.includes("src/Button.tsx"), "tool_use changedPaths 应含相对路径");
});

// ─── cancel + close ───

test("cancel：POST /interrupt + 本地标记 cancelled", async () => {
  const mock = createMockHttp({
    "POST /conversations": { data: { conversation_id: "conv-6" } },
    "POST /conversations/conv-6/run": { data: {} },
    "POST /interrupt": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await adapter.cancel(sessionId);
  assert.ok(
    mock.calls.some((c) => c.method === "POST" && /interrupt/.test(c.path)),
    "应 POST /interrupt"
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
    "POST /conversations": { data: { conversation_id: "conv-7" } },
    "POST /conversations/conv-7/run": { data: {} },
  });
  const adapter = new OpenHandsAdapter({ httpFn: mock.fn, env: ENV });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await adapter.close();
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "failed");
});
