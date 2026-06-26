import test from "node:test";
import assert from "node:assert/strict";

const {
  createFullCycleJob,
  getFullCycleJob,
  listFullCycleJobsByIteration,
  markFullCycleCompleted,
  markFullCycleFailed,
} = await import("../dist/application/workspace/quality/fullCycleJobOps.js");

function newStore() {
  return { jobs: new Map() };
}

function stubResponse(iterationId) {
  return { iterationId, status: "completed", steps: {}, blockers: [], warnings: [] };
}

// ─── job 生命周期 ───

test("createFullCycleJob 创建即进入 running（触发即跑，无排队阶段）", () => {
  const store = newStore();
  const job = createFullCycleJob(store, { jobId: "fc-1", iterationId: 10, now: "2026-06-26T00:00:00.000Z" });
  assert.equal(job.jobId, "fc-1");
  assert.equal(job.status, "running");
  assert.equal(job.iterationId, 10);
  assert.equal(job.finalResponse, null);
  assert.equal(job.error, "");
  assert.equal(getFullCycleJob(store, "fc-1").status, "running");
});

test("markFullCycleCompleted: running → completed，记录最终响应", () => {
  const store = newStore();
  createFullCycleJob(store, { jobId: "fc-1", iterationId: 10, now: "t1" });
  const finalResponse = stubResponse(10);
  const job = markFullCycleCompleted(store, "fc-1", { finishedAt: "t2", finalResponse });
  assert.equal(job.status, "completed");
  assert.equal(job.finishedAt, "t2");
  assert.equal(job.finalResponse, finalResponse);
});

test("markFullCycleFailed: running → failed，记录失败原因", () => {
  const store = newStore();
  createFullCycleJob(store, { jobId: "fc-1", iterationId: 10, now: "t1" });
  const job = markFullCycleFailed(store, "fc-1", { finishedAt: "t2", error: "前端改写超时" });
  assert.equal(job.status, "failed");
  assert.equal(job.error, "前端改写超时");
});

// ─── 非法状态转换 ───

test("markFullCycleCompleted 在已完成 job 上抛错（不可重复完成）", () => {
  const store = newStore();
  createFullCycleJob(store, { jobId: "fc-1", iterationId: 10, now: "t1" });
  markFullCycleCompleted(store, "fc-1", { finishedAt: "t2", finalResponse: null });
  assert.throws(
    () => markFullCycleCompleted(store, "fc-1", { finishedAt: "t3", finalResponse: null }),
    /cannot transition/
  );
});

test("markFullCycleFailed 在已失败 job 上抛错", () => {
  const store = newStore();
  createFullCycleJob(store, { jobId: "fc-1", iterationId: 10, now: "t1" });
  markFullCycleFailed(store, "fc-1", { finishedAt: "t2", error: "err1" });
  assert.throws(
    () => markFullCycleFailed(store, "fc-1", { finishedAt: "t3", error: "err2" }),
    /cannot transition/
  );
});

// ─── 查询 ───

test("getFullCycleJob 不存在返回 null（而非抛错）", () => {
  const store = newStore();
  assert.equal(getFullCycleJob(store, "nonexistent"), null);
});

test("listFullCycleJobsByIteration 按 iterationId 过滤", () => {
  const store = newStore();
  createFullCycleJob(store, { jobId: "j1", iterationId: 10, now: "t1" });
  createFullCycleJob(store, { jobId: "j2", iterationId: 11, now: "t1" });
  createFullCycleJob(store, { jobId: "j3", iterationId: 10, now: "t1" });
  const jobs = listFullCycleJobsByIteration(store, 10);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.iterationId === 10));
});
