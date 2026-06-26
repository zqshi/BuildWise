import test from "node:test";
import assert from "node:assert/strict";

const { executeCodeRewriteViaAgent } = await import(
  "../dist/application/workspace/quality/codeRewriteOps.js"
);

const REPO = "/tmp/demo-repo";

// ─── Mock 编码 agent adapter：立即 completed，改 src/Button.tsx ───

function createMockAdapter({ changedPaths = ["src/Button.tsx"], fail = false } = {}) {
  const calls = { start: 0, getStatus: 0, getEvents: 0, cancel: 0, close: 0 };
  return {
    agentType: "mock-agent",
    implemented: true,
    calls,
    async start() { calls.start++; return { sessionId: "sess-1" }; },
    async getStatus(sessionId) {
      calls.getStatus++;
      return fail
        ? { status: "failed", finishedAt: "t2", exitCode: 1, error: "agent error" }
        : { status: "completed", finishedAt: "t2", exitCode: 0 };
    },
    async getEvents() { calls.getEvents++; return [{ type: "tool_use", content: "Edit", timestamp: "t1", changedPaths }]; },
    async cancel() { calls.cancel++; },
    async close() { calls.close++; },
  };
}

// ─── Mock gitOps ───

function createMockGitOps(changedPaths, fileContents) {
  return {
    listChangedPaths: async () => changedPaths,
    readFileContent: async (_repoPath, path) => fileContents[path] ?? { before: "", after: "" },
    revertFile: async () => {},
  };
}

// ─── Mock registry.create 返回 adapter ───

function createMockRegistry(adapter) {
  return { create: () => adapter };
}

const BASE_CONTEXT = {
  repoPath: REPO,
  boundaryCodePaths: ["src/Button.tsx"],
  instruction: "把按钮文案改成提交",
  role: "frontend-developer",
  acceptanceCriteria: ["按钮文案为提交"],
  maxFiles: 6,
};

test("编码 agent 完成后：合法改动生成 edit", async () => {
  const adapter = createMockAdapter({ changedPaths: ["src/Button.tsx"] });
  const gitOps = createMockGitOps(
    ["src/Button.tsx"],
    { "src/Button.tsx": { before: "old button", after: "new button" } }
  );
  const result = await executeCodeRewriteViaAgent({
    registry: createMockRegistry(adapter),
    gitOps,
    context: BASE_CONTEXT,
  });
  assert.equal(result.edits.length, 1);
  assert.equal(result.edits[0].path, "src/Button.tsx");
  assert.ok(result.edits[0].afterPreview.includes("new button"));
  assert.equal(result.violations.length, 0);
});

test("越界改动：标记 reverted + 调用 revertFile 回滚", async () => {
  const adapter = createMockAdapter({ changedPaths: ["src/Button.tsx", "src/secret.ts"] });
  const revertedPaths = [];
  const gitOps = {
    listChangedPaths: async () => ["src/Button.tsx", "src/secret.ts"],
    readFileContent: async (_repoPath, path) =>
      path === "src/Button.tsx" ? { before: "old", after: "new" } : { before: "key=1", after: "key=2" },
    revertFile: async (_repoPath, path) => { revertedPaths.push(path); },
  };
  const result = await executeCodeRewriteViaAgent({
    registry: createMockRegistry(adapter),
    gitOps,
    context: BASE_CONTEXT,
  });
  assert.equal(result.edits.length, 1); // 只有 Button 合法
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].path, "src/secret.ts");
  assert.deepEqual(revertedPaths, ["src/secret.ts"]);
});

test("agent failed → 抛错含 agent error", async () => {
  const adapter = createMockAdapter({ fail: true });
  const gitOps = createMockGitOps([], {});
  await assert.rejects(
    executeCodeRewriteViaAgent({ registry: createMockRegistry(adapter), gitOps, context: BASE_CONTEXT }),
    /agent error/
  );
});

test("registry.create 抛错（无可用适配器）→ 抛错", async () => {
  const gitOps = createMockGitOps([], {});
  const registry = { create: () => { throw new Error("no adapter available"); } };
  await assert.rejects(
    executeCodeRewriteViaAgent({ registry, gitOps, context: BASE_CONTEXT }),
    /no adapter available/
  );
});

test("adapter.start/getStatus/getEvents 被正确调用", async () => {
  const adapter = createMockAdapter({ changedPaths: ["src/Button.tsx"] });
  const gitOps = createMockGitOps(["src/Button.tsx"], { "src/Button.tsx": { before: "a", after: "b" } });
  await executeCodeRewriteViaAgent({ registry: createMockRegistry(adapter), gitOps, context: BASE_CONTEXT });
  assert.ok(adapter.calls.start >= 1);
  assert.ok(adapter.calls.getStatus >= 1);
  assert.ok(adapter.calls.getEvents >= 1);
});
