import test from "node:test";
import assert from "node:assert/strict";

const {
  createCodeRewriteJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  getCodeRewriteJob,
  appendJobEvents,
  listCodeRewriteJobsByIteration,
} = await import("../dist/application/workspace/quality/codeRewriteJobOps.js");

function newStore() {
  return { jobs: new Map() };
}

// ─── job 生命周期 ───

test("createCodeRewriteJob 初始状态 pending", () => {
  const store = newStore();
  const job = createCodeRewriteJob(store, {
    jobId: "job-1", iterationId: 10, instruction: "改按钮", repoPath: "/tmp/repo",
    boundaryCodePaths: ["src/Button.tsx"], role: "frontend-developer", now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(job.jobId, "job-1");
  assert.equal(job.status, "pending");
  assert.equal(job.iterationId, 10);
  assert.deepEqual(job.boundaryCodePaths, ["src/Button.tsx"]);
  assert.equal(job.events.length, 0);
  assert.equal(job.edits.length, 0);
  assert.equal(getCodeRewriteJob(store, "job-1").status, "pending");
});

test("markJobRunning: pending → running", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  const job = markJobRunning(store, "job-1", { sessionId: "sess-1", startedAt: "t2" });
  assert.equal(job.status, "running");
  assert.equal(job.sessionId, "sess-1");
  assert.equal(job.startedAt, "t2");
});

test("markJobCompleted: running → completed，记录 edits 与 boundaryViolations", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: ["src/a.ts"], now: "t1" });
  markJobRunning(store, "job-1", { sessionId: "s", startedAt: "t2" });
  const job = markJobCompleted(store, "job-1", {
    finishedAt: "t3",
    edits: [{ path: "src/a.ts", reason: "改了", beforePreview: "old", afterPreview: "new" }],
    boundaryViolations: [{ path: "src/b.ts", action: "reverted" }],
  });
  assert.equal(job.status, "completed");
  assert.equal(job.edits.length, 1);
  assert.equal(job.edits[0].path, "src/a.ts");
  assert.equal(job.boundaryViolations.length, 1);
  assert.equal(job.boundaryViolations[0].path, "src/b.ts");
});

test("markJobFailed: running → failed，记录 error", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  markJobRunning(store, "job-1", { sessionId: "s", startedAt: "t2" });
  const job = markJobFailed(store, "job-1", { finishedAt: "t3", error: "claude timeout" });
  assert.equal(job.status, "failed");
  assert.equal(job.error, "claude timeout");
});

// ─── 非法状态转换 ───

test("markJobRunning 在已完成 job 上抛错（不可重复启动）", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  markJobRunning(store, "job-1", { sessionId: "s", startedAt: "t2" });
  markJobCompleted(store, "job-1", { finishedAt: "t3", edits: [], boundaryViolations: [] });
  assert.throws(() => markJobRunning(store, "job-1", { sessionId: "s2", startedAt: "t4" }), /cannot transition/);
});

test("markJobCompleted 在 pending job（未 running）上抛错", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  assert.throws(() => markJobCompleted(store, "job-1", { finishedAt: "t2", edits: [], boundaryViolations: [] }), /cannot transition/);
});

// ─── 事件追加 ───

test("appendJobEvents 追加编码 agent 事件到 job", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "job-1", iterationId: 10, instruction: "改", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  markJobRunning(store, "job-1", { sessionId: "s", startedAt: "t2" });
  appendJobEvents(store, "job-1", [
    { type: "tool_use", content: "Edit", timestamp: "t3", changedPaths: ["src/a.ts"] },
    { type: "text", content: "done", timestamp: "t4" },
  ]);
  assert.equal(getCodeRewriteJob(store, "job-1").events.length, 2);
});

// ─── 查询 ───

test("getCodeRewriteJob 不存在返回 null（而非抛错）", () => {
  const store = newStore();
  assert.equal(getCodeRewriteJob(store, "nonexistent"), null);
});

test("listCodeRewriteJobsByIteration 按 iterationId 过滤", () => {
  const store = newStore();
  createCodeRewriteJob(store, { jobId: "j1", iterationId: 10, instruction: "a", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  createCodeRewriteJob(store, { jobId: "j2", iterationId: 11, instruction: "b", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  createCodeRewriteJob(store, { jobId: "j3", iterationId: 10, instruction: "c", repoPath: "/r", boundaryCodePaths: [], now: "t1" });
  const jobs = listCodeRewriteJobsByIteration(store, 10);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.iterationId === 10));
});
