import test from "node:test";
import assert from "node:assert/strict";
import { waitForFullCycleJob, type FullCycleJobStatusResponse } from "../src/app/fullCycleJobPoll.ts";
import type { IterationFullCycleRunResponse } from "../src/domain/workspace/types";

function makeStatus(overrides: Partial<FullCycleJobStatusResponse> = {}): FullCycleJobStatusResponse {
  return {
    jobId: "fc-1",
    iterationId: 1,
    status: "running",
    createdAt: "t1",
    startedAt: "t1",
    finishedAt: "",
    finalResponse: null,
    error: "",
    checkpoint: null,
    ...overrides,
  };
}

const FINAL_RESPONSE = { iterationId: 1, status: "completed" } as unknown as IterationFullCycleRunResponse;

// ─── 终态 ───

test("waitForFullCycleJob: running → completed 返回最终响应", async () => {
  let calls = 0;
  const result = await waitForFullCycleJob({
    timeoutMs: 2000,
    pollIntervalMs: 0,
    fetchJob: async () => {
      calls += 1;
      return calls === 1
        ? makeStatus({ status: "running" })
        : makeStatus({ status: "completed", finalResponse: FINAL_RESPONSE });
    },
  });
  assert.equal(result, FINAL_RESPONSE);
  assert.equal(calls, 2);
});

test("waitForFullCycleJob: failed 抛错含 error", async () => {
  await assert.rejects(
    waitForFullCycleJob({
      timeoutMs: 2000,
      pollIntervalMs: 0,
      fetchJob: async () => makeStatus({ status: "failed", error: "前端改写超时" }),
    }),
    /前端改写超时/
  );
});

test("waitForFullCycleJob: interrupted 抛 fullcycle_interrupted 供调用方识别续跑", async () => {
  await assert.rejects(
    waitForFullCycleJob({
      timeoutMs: 2000,
      pollIntervalMs: 0,
      fetchJob: async () => makeStatus({ status: "interrupted" }),
    }),
    /fullcycle_interrupted/
  );
});

// ─── 退避与容错 ───

test("waitForFullCycleJob: 轮询错误退避后恢复成功", async () => {
  let calls = 0;
  const result = await waitForFullCycleJob({
    timeoutMs: 5000,
    pollIntervalMs: 0,
    backoffDelays: [0],
    fetchJob: async () => {
      calls += 1;
      if (calls === 1) throw new Error("network unavailable");
      return makeStatus({ status: "completed", finalResponse: FINAL_RESPONSE });
    },
  });
  assert.equal(result, FINAL_RESPONSE);
  assert.equal(calls, 2);
});

test("waitForFullCycleJob: 连续轮询错误超限抛错", async () => {
  await assert.rejects(
    waitForFullCycleJob({
      timeoutMs: 5000,
      pollIntervalMs: 0,
      backoffDelays: [0],
      maxConsecutivePollErrors: 2,
      fetchJob: async () => {
        throw new Error("network unavailable");
      },
    }),
    /全流程任务轮询失败/
  );
});

test("waitForFullCycleJob: running 停滞（无进度）超时抛错", async () => {
  await assert.rejects(
    waitForFullCycleJob({
      timeoutMs: 5000,
      pollIntervalMs: 0,
      runningStallTimeoutMs: 50,
      fetchJob: async () => makeStatus({ status: "running" }),
    }),
    /执行停滞/
  );
});

test("waitForFullCycleJob: cancelled 抛 fullcycle_cancelled 供调用方识别取消", async () => {
  await assert.rejects(
    waitForFullCycleJob({
      timeoutMs: 2000,
      pollIntervalMs: 0,
      fetchJob: async () => makeStatus({ status: "cancelled" }),
    }),
    /fullcycle_cancelled/
  );
});
