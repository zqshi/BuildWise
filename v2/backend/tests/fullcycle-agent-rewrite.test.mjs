import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalIteration } from "./helpers/mock-factories.mjs";

const { QualityService } = await import(
  "../dist/application/workspace/quality/qualityService.js"
);
const { AgentRegistry } = await import("../dist/infrastructure/agent/agentRegistry.js");

// ─── T3: fullCycle 编码步骤接真实 codingAgent ───
//
// QualityService.rewriteCodeInBoundaryViaAgent:有 codingAgentRegistry 时走真实 codingAgent
// (executeCodeRewriteViaAgent: registry.create→start→轮询→git diff→边界校验→回滚越界),
// 适配返回 IterationCodeRewriteResponse(violations→outOfBoundaryFiles, edits 直用)。
// 无 registry 时 fullCycle 降级到 LLM(rewriteCodeInBoundaryOp)。

const REPO = "/tmp/demo-repo";

// mock adapter:立即 completed,改指定文件
function createMockAdapter(changedPaths) {
  return {
    agentType: "mock-agent",
    implemented: true,
    async start() { return { sessionId: "sess-1" }; },
    async getStatus() { return { status: "completed", finishedAt: "t2", exitCode: 0 }; },
    async getEvents() { return [{ type: "tool_use", content: "Edit", timestamp: "t1", changedPaths }]; },
    async cancel() {},
    async close() {},
  };
}

// mock gitOps(注入,生产用 realCodeRewriteGitOps)
function createMockGitOps(changedPaths, fileContents) {
  return {
    listChangedPaths: async () => changedPaths,
    readFileContent: async (_repoPath, path) => fileContents[path] ?? { before: "", after: "" },
    revertFile: async () => {},
  };
}

function setupRepoWithBoundary() {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P", repository: { workspace: { repoPath: REPO } } });
  const now = new Date().toISOString();
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      boundary: {
        codePaths: ["src/Button.tsx"],
        requirementRefs: [], componentRefs: [],
        note: "", updatedAt: now,
      },
    },
  });
  repo._store.iterations.push(iter);
  return { repo, iter };
}

function makeRegistry(adapter) {
  const registry = new AgentRegistry();
  registry.register("mock-agent", () => adapter);
  return registry;
}

test("rewriteCodeInBoundaryViaAgent:有 registry → 走真实 codingAgent,返回 IterationCodeRewriteResponse", async () => {
  const { repo } = setupRepoWithBoundary();
  const adapter = createMockAdapter(["src/Button.tsx"]);
  const gitOps = createMockGitOps(["src/Button.tsx"], { "src/Button.tsx": { before: "Submit", after: "登录" } });
  const service = new QualityService(repo, null, null, makeRegistry(adapter), { jobs: new Map() }, gitOps);

  const result = await service.rewriteCodeInBoundaryViaAgent(10, {
    instruction: "把 Submit 改成 登录",
    maxFiles: 6,
    role: "frontend-developer",
  }, "mock-agent");

  assert.ok(result, "应返回结果");
  assert.equal(result.iterationId, 10);
  assert.equal(result.dryRun, false, "agent 路径非 dryRun");
  assert.equal(result.edits.length, 1, "应含 agent 的 1 处改动");
  assert.equal(result.edits[0].path, "src/Button.tsx");
  assert.ok(result.edits[0].afterPreview.includes("登录"));
  assert.equal(result.outOfBoundaryFiles.length, 0, "无越界");
  assert.deepEqual(result.appliedFiles, ["src/Button.tsx"]);
});

test("越界改动:violations 映射为 outOfBoundaryFiles 且已回滚", async () => {
  const { repo } = setupRepoWithBoundary();
  const adapter = createMockAdapter(["src/Button.tsx", "src/secret.ts"]);
  const revertedPaths = [];
  const gitOps = {
    listChangedPaths: async () => ["src/Button.tsx", "src/secret.ts"],
    readFileContent: async (_rp, path) =>
      path === "src/Button.tsx" ? { before: "old", after: "new" } : { before: "key=1", after: "key=2" },
    revertFile: async (_rp, path) => { revertedPaths.push(path); },
  };
  const service = new QualityService(repo, null, null, makeRegistry(adapter), { jobs: new Map() }, gitOps);

  const result = await service.rewriteCodeInBoundaryViaAgent(10, {
    instruction: "改", maxFiles: 6, role: "frontend-developer",
  }, "mock-agent");

  assert.equal(result.edits.length, 1, "仅边界内 Button 合法");
  assert.deepEqual(result.outOfBoundaryFiles, ["src/secret.ts"], "越界文件映射到 outOfBoundaryFiles");
  assert.deepEqual(revertedPaths, ["src/secret.ts"], "越界文件已回滚");
});

test("rewriteCodeInBoundaryViaAgent 无 registry 时返回 null(fullCycle 降级 LLM)", async () => {
  const { repo } = setupRepoWithBoundary();
  const service = new QualityService(repo, null, null, null, null);
  const result = await service.rewriteCodeInBoundaryViaAgent(10, {
    instruction: "改", maxFiles: 6, role: "frontend-developer",
  });
  assert.equal(result, null, "无 registry 应返回 null,调用方降级 LLM");
});

test("agent failed → 抛错(供 fullCycle 步骤标记 failed)", async () => {
  const { repo } = setupRepoWithBoundary();
  const adapter = {
    agentType: "mock", implemented: true,
    async start() { return { sessionId: "s" }; },
    async getStatus() { return { status: "failed", finishedAt: "t", exitCode: 1, error: "agent boom" }; },
    async getEvents() { return []; },
    async cancel() {},
    async close() {},
  };
  const gitOps = createMockGitOps([], {});
  const service = new QualityService(repo, null, null, makeRegistry(adapter), { jobs: new Map() }, gitOps);
  await assert.rejects(
    service.rewriteCodeInBoundaryViaAgent(10, { instruction: "改", maxFiles: 6, role: "frontend-developer" }, "mock-agent"),
    /agent boom/
  );
});
