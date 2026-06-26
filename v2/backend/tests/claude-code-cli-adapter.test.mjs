import test from "node:test";
import assert from "node:assert/strict";

const { ClaudeCodeCliAdapter } = await import(
  "../dist/infrastructure/agent/adapters/claudeCodeCliAdapter.js"
);
const { isCodingAgentAvailable } = await import("../dist/domain/shared/codingAgent.js");

// ─── Mock spawn：返回伪 child process，按行推送预设的 stream-json 输出 ───

function createMockSpawn(outputLines = []) {
  const calls = [];
  return {
    calls,
    spawn(bin, args, opts) {
      calls.push({ bin, args, opts });
      const listeners = { stdout: [], stderr: [], exit: [], error: [] };
      const proc = {
        pid: 10000 + calls.length,
        stdout: { on: (_e, cb) => listeners.stdout.push(cb) },
        stderr: { on: (_e, cb) => listeners.stderr.push(cb) },
        on: (e, cb) => listeners[e]?.push(cb),
        kill: () => {
          listeners.exit.forEach((cb) => cb(0, null));
        },
      };
      // 异步推送预设输出行（模拟 stream-json 逐行到达）
      setTimeout(() => {
        for (const line of outputLines) {
          listeners.stdout.forEach((cb) => cb(Buffer.from(line + "\n")));
        }
        listeners.exit.forEach((cb) => cb(0, null));
      }, 0);
      return proc;
    },
  };
}

const REPO = "/tmp/demo-repo";

// 真实 claude CLI stream-json 格式（2026-06-25 实跑捕获：claude_code 2.1.177 / glm-5.2）
// 关键：tool_result 内嵌在 type:"user" 的 message.content 里，而非顶层 type:"tool_result"
const SAMPLE_STREAM_JSON = [
  JSON.stringify({ type: "system", subtype: "init", cwd: REPO, session_id: "sess-xyz", tools: ["Edit", "Write", "Read"], model: "glm-5.2", permissionMode: "bypassPermissions" }),
  JSON.stringify({ type: "system", subtype: "thinking_tokens", estimated_tokens: 10, estimated_tokens_delta: 10 }),
  JSON.stringify({ type: "assistant", message: { id: "m1", role: "assistant", content: [{ type: "thinking", thinking: "先读文件再改。" }] } }),
  JSON.stringify({ type: "assistant", message: { id: "m2", role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "Edit", input: { replace_all: false, file_path: `${REPO}/src/Button.tsx`, old_string: "Submit", new_string: "登录" } }] } }),
  JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "The file src/Button.tsx has been updated successfully." }] } }),
  JSON.stringify({ type: "assistant", message: { id: "m3", role: "assistant", content: [{ type: "text", text: "已改完。" }] } }),
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "已改完。", duration_ms: 76112, total_cost_usd: 0.176 }),
];

// ─── 端口契约 ───

test("ClaudeCodeCliAdapter 满足 CodingAgentAdapter 端口", () => {
  const mockSpawn = createMockSpawn();
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  assert.equal(adapter.agentType, "claude-code-cli");
  assert.equal(adapter.implemented, true);
  assert.equal(isCodingAgentAvailable(adapter), true);
});

test("start 用 -p/--print --output-format stream-json --add-dir repoPath 调用 claude", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  await adapter.start({
    repoPath: REPO,
    instruction: "把按钮文案改成提交",
    boundaryCodePaths: ["src/Button.tsx"],
    role: "frontend-developer",
  });
  assert.equal(mockSpawn.calls.length, 1);
  const { bin, args, opts } = mockSpawn.calls[0];
  assert.equal(bin, "claude");
  assert.ok(args.includes("-p") || args.includes("--print"), "应用 -p/--print");
  assert.ok(args.includes("stream-json"), "应用 --output-format stream-json");
  assert.ok(args.includes(REPO), "应用 --add-dir repoPath");
  assert.equal(opts.cwd, REPO, "cwd 应为 repoPath");
  assert.ok(args.includes("--verbose"), "应用 --verbose（claude -p + stream-json 必需，缺失则 exit=1 零输出）");
  assert.ok(args.includes("bypassPermissions"), "应用 --permission-mode bypassPermissions（headless 自动执行 Edit/Write，否则工具调用被权限阻断）");
});

test("start 后初始状态 running，进程退出后 completed", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  const status1 = await adapter.getStatus(sessionId);
  assert.equal(status1.status, "running");

  // 等待 mock 推送完输出并 exit
  await new Promise((r) => setTimeout(r, 50));
  const status2 = await adapter.getStatus(sessionId);
  assert.equal(status2.status, "completed");
});

test("getEvents 解析 stream-json：tool_use(Edit) → changedPaths 含 file_path", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await new Promise((r) => setTimeout(r, 50));
  const events = await adapter.getEvents(sessionId);
  assert.ok(events.length > 0, "应解析出事件");
  const toolUse = events.find((e) => e.type === "tool_use");
  assert.ok(toolUse, "应含 tool_use 事件");
  assert.ok(toolUse.changedPaths?.includes("src/Button.tsx"), "changedPaths 应含相对路径 src/Button.tsx");
});

test("getEvents since 游标：只返回后续事件", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await new Promise((r) => setTimeout(r, 50));
  const all = await adapter.getEvents(sessionId);
  const firstTs = all[0].timestamp;
  const later = await adapter.getEvents(sessionId, firstTs);
  assert.ok(later.length <= all.length, "since 游标后事件数应 ≤ 全量");
});

test("cancel 终止运行中的会话", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await adapter.cancel(sessionId);
  await new Promise((r) => setTimeout(r, 30));
  const status = await adapter.getStatus(sessionId);
  assert.equal(status.status, "cancelled");
});

test("getStatus 不存在的 sessionId 返回 failed", async () => {
  const mockSpawn = createMockSpawn();
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const status = await adapter.getStatus("nonexistent");
  assert.equal(status.status, "failed");
});

test("instruction 作为 -p 的参数传入", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  await adapter.start({ repoPath: REPO, instruction: "把按钮文案改成提交", boundaryCodePaths: [] });
  const { args } = mockSpawn.calls[0];
  assert.ok(args.includes("把按钮文案改成提交"), "instruction 应作为 -p 参数");
});

test("getEvents 解析 type:user 消息内嵌的 tool_result 事件", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await new Promise((r) => setTimeout(r, 50));
  const events = await adapter.getEvents(sessionId);
  const toolResult = events.find((e) => e.type === "tool_result");
  assert.ok(toolResult, "应从 type:user 消息解析出 tool_result 事件");
  assert.match(toolResult.content, /updated successfully/);
});

test("getEvents 解析最终 result 文本", async () => {
  const mockSpawn = createMockSpawn(SAMPLE_STREAM_JSON);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: [] });
  await new Promise((r) => setTimeout(r, 50));
  const events = await adapter.getEvents(sessionId);
  const resultEvent = events.find((e) => e.type === "text" && e.content === "已改完。");
  assert.ok(resultEvent, "应解析出 result 事件文本");
});

test("真实样本：含 init/api_retry/thinking 噪声仍能解析出 Edit 的 changedPaths", async () => {
  // 贴近 2026-06-25 实跑捕获的真实 stream-json 结构
  const realLikeStream = [
    JSON.stringify({ type: "system", subtype: "init", cwd: REPO, session_id: "s", tools: ["Edit", "Write", "Read"], model: "glm-5.2", permissionMode: "bypassPermissions" }),
    JSON.stringify({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, error_status: 429, error: "rate_limit" }),
    JSON.stringify({ type: "system", subtype: "thinking_tokens", estimated_tokens: 5, estimated_tokens_delta: 5 }),
    JSON.stringify({ type: "assistant", message: { id: "a1", role: "assistant", content: [{ type: "thinking", thinking: "改按钮文案。" }] } }),
    JSON.stringify({ type: "assistant", message: { id: "a2", role: "assistant", content: [{ type: "tool_use", id: "call_x", name: "Edit", input: { file_path: `${REPO}/src/button.tsx`, old_string: "Submit", new_string: "登录" } }] } }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "call_x", content: "The file src/button.tsx has been updated successfully." }] } }),
    JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "已改完。", duration_ms: 76112, total_cost_usd: 0.176 }),
  ];
  const mockSpawn = createMockSpawn(realLikeStream);
  const adapter = new ClaudeCodeCliAdapter({ spawnFn: mockSpawn.spawn, claudePath: "claude" });
  const { sessionId } = await adapter.start({ repoPath: REPO, instruction: "改", boundaryCodePaths: ["src/button.tsx"] });
  await new Promise((r) => setTimeout(r, 50));
  const events = await adapter.getEvents(sessionId);
  const toolUse = events.find((e) => e.type === "tool_use");
  assert.ok(toolUse, "应解析出 tool_use 事件");
  assert.ok(toolUse.changedPaths?.includes("src/button.tsx"), "changedPaths 应为相对路径 src/button.tsx");
  const toolResult = events.find((e) => e.type === "tool_result");
  assert.ok(toolResult, "应解析出 user 消息里的 tool_result（噪声事件 init/api_retry/thinking 不映射为业务事件）");
});
