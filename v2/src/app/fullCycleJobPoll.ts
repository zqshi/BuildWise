/**
 * fullCycleJobPoll — fullCycle 全流程任务轮询纯逻辑
 *
 * 从 workspaceApiAgentOps 抽出，仅 import type（零运行时 src 依赖），
 * 使其可被 node --experimental-strip-types --test 直接测。
 * 生产侧退避/超时由 workspaceApiAgentOps.runFullCycleJob 用 getRuntimeConfig 覆盖。
 */

import type { IterationFullCycleRunResponse } from "../domain/workspace/types";

export type FullCycleJobStatusResponse = {
  jobId: string;
  iterationId: number;
  status: "running" | "completed" | "failed" | "interrupted";
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  finalResponse: IterationFullCycleRunResponse | null;
  error: string;
  checkpoint: Record<string, unknown> | null;
};

const DEFAULT_BACKOFF_DELAYS = [1000, 2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, 30000];
const DEFAULT_TIMEOUT_MS = 1800000;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_RUNNING_STALL_TIMEOUT_MS = 300000;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5;

/**
 * 轮询全流程任务直到终态。completed 返回最终响应；failed/interrupted/超时抛错。
 * 进程重启后后端返回 interrupted（内存句柄丢但 checkpoint 在），调用方据此提示续跑。
 * fetchJob 由调用方注入（生产用 fetchFullCycleJob，测试用 stub）。
 */
export async function waitForFullCycleJob(options: {
  fetchJob: () => Promise<FullCycleJobStatusResponse>;
  onProgress?: (status: FullCycleJobStatusResponse) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
  runningStallTimeoutMs?: number;
  backoffDelays?: number[];
  maxConsecutivePollErrors?: number;
}): Promise<IterationFullCycleRunResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const runningStallTimeoutMs = options.runningStallTimeoutMs ?? DEFAULT_RUNNING_STALL_TIMEOUT_MS;
  const maxConsecutivePollErrors = options.maxConsecutivePollErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
  const backoffDelays = options.backoffDelays ?? DEFAULT_BACKOFF_DELAYS;
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastMarker = "";
  let consecutivePollErrors = 0;
  while (Date.now() - startedAt < timeoutMs) {
    let status: FullCycleJobStatusResponse;
    try {
      status = await options.fetchJob();
      consecutivePollErrors = 0;
    } catch (error) {
      consecutivePollErrors += 1;
      if (consecutivePollErrors >= maxConsecutivePollErrors) {
        throw new Error(`全流程任务轮询失败：${error instanceof Error ? error.message : "unknown"}（连续 ${consecutivePollErrors} 次）`);
      }
      const backoffMs = backoffDelays[Math.min(consecutivePollErrors - 1, backoffDelays.length - 1)];
      await new Promise<void>((r) => setTimeout(r, backoffMs));
      continue;
    }
    const marker = `${status.status}|${status.finishedAt}|${status.error}|${status.checkpoint ? JSON.stringify(status.checkpoint).length : 0}`;
    if (marker !== lastMarker) { lastMarker = marker; lastProgressAt = Date.now(); }
    if (status.status === "running" && Date.now() - lastProgressAt >= runningStallTimeoutMs) {
      throw new Error(`全流程任务执行停滞（${Math.round(runningStallTimeoutMs / 1000)}秒无进度）`);
    }
    options.onProgress?.(status);
    if (status.status === "completed") {
      if (!status.finalResponse) throw new Error("全流程任务完成但未返回结果");
      return status.finalResponse;
    }
    if (status.status === "failed") throw new Error(status.error || "全流程执行失败");
    if (status.status === "interrupted") throw new Error("fullcycle_interrupted");
    await new Promise<void>((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`全流程任务超时（${Math.round(timeoutMs / 1000)}秒）`);
}
