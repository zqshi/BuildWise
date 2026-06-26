import type { AttachmentAnalysisJob, AttachmentUploadInput } from '../../../domain/workspace/types';

export type AttachmentAnalysisJobRuntime = AttachmentAnalysisJob & {
  input: AttachmentUploadInput;
  inputFingerprint: string;
};

export function createQueuedAnalysisJobOp(params: {
  iterationId: number;
  input: AttachmentUploadInput;
  inputFingerprint: string;
  now: string;
  jobId: string;
  inputSummary: AttachmentAnalysisJob["inputSummary"];
}): AttachmentAnalysisJobRuntime {
  const { iterationId, input, inputFingerprint, now, jobId, inputSummary } = params;
  return {
    jobId,
    iterationId,
    status: "queued",
    createdAt: now,
    startedAt: "",
    finishedAt: "",
    inputSummary,
    progress: {
      totalFiles: inputSummary.totalFiles,
      processedFiles: 0,
      totalBatches: 0,
      completedBatches: 0,
      failedBatches: 0,
      retriedBatches: 0,
      llmCallCount: 0,
      llmSuccessCount: 0,
      llmFailureCount: 0,
      llmInFlightCount: 0,
      currentBatch: 0,
      currentAttempt: 0,
      stageHint: "queued",
      lastLlmCallAt: ""
    },
    warnings: [],
    error: "",
    result: null,
    input,
    inputFingerprint
  };
}

export function reconcileAnalysisJobsOp(params: {
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>;
  analysisQueuedStallTimeoutMs: number;
  analysisJobTimeoutMs: number;
  nowMs?: number;
  nowIso?: string;
}) {
  const { analysisJobs, analysisQueuedStallTimeoutMs, analysisJobTimeoutMs } = params;
  const nowMs = Number.isFinite(params.nowMs) ? Number(params.nowMs) : Date.now();
  for (const job of analysisJobs.values()) {
    if (job.status === "queued") {
      const createdAt = new Date(job.createdAt || "").getTime();
      if (Number.isFinite(createdAt) && nowMs - createdAt >= analysisQueuedStallTimeoutMs) {
        job.status = "failed";
        job.finishedAt = params.nowIso || new Date().toISOString();
        job.error = `分析任务在队列中等待超时（${Math.round(analysisQueuedStallTimeoutMs / 1000)}秒）`;
        job.progress.stageHint = "failed:queued_stall";
      }
      continue;
    }
    if (job.status === "running") {
      const startedAt = new Date(job.startedAt || "").getTime();
      if (Number.isFinite(startedAt) && nowMs - startedAt >= analysisJobTimeoutMs) {
        job.status = "failed";
        job.finishedAt = params.nowIso || new Date().toISOString();
        job.error = `分析任务执行超时（${Math.round(analysisJobTimeoutMs / 1000)}秒）`;
        job.progress.stageHint = "failed:running_timeout";
      }
    }
  }
  return Array.from(analysisJobs.values()).filter((item) => item.status === "running").length;
}

export function triggerAnalysisQueueOp(params: {
  analysisQueue: string[];
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>;
  analysisWorkerConcurrency: number;
  getRunningWorkers: () => number;
  setRunningWorkers: (value: number) => void;
  reconcile: () => void;
  runJobWithTimeout: (jobId: string) => Promise<void>;
  triggerAgain: () => void;
}) {
  const {
    analysisQueue,
    analysisJobs,
    analysisWorkerConcurrency,
    getRunningWorkers,
    setRunningWorkers,
    reconcile,
    runJobWithTimeout,
    triggerAgain
  } = params;
  reconcile();
  while (getRunningWorkers() < analysisWorkerConcurrency && analysisQueue.length > 0) {
    const nextJobId = analysisQueue.shift();
    if (!nextJobId) {
      return;
    }
    const job = analysisJobs.get(nextJobId);
    if (!job || job.status !== "queued") {
      continue;
    }
    setRunningWorkers(Math.max(0, getRunningWorkers()) + 1);
    void runJobWithTimeout(nextJobId)
      .catch(async (err) => {
        const log = (await import("../../../infrastructure/runtime/logger")).createLogger("analysis-queue");
        log.warn("analysis job failed", { jobId: nextJobId, error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        setRunningWorkers(Math.max(0, getRunningWorkers() - 1));
        triggerAgain();
      });
  }
}

/**
 * 重启恢复：进程重启后，DB 读回内存的 running/queued 分析任务已无 worker 执行
 * （runningAnalysisWorkers 归零、队列丢失），形成「幽灵 running」——前端轮询要等
 * 25min 超时才看到 failed。本函数在启动恢复阶段把这些任务立即标 failed（带中断原因），
 * 并通过 onMarkFailed 记录失败输入快照供用户手动 retry，onPersist 写回 DB。
 * 已 succeeded/failed 的任务保持原状。返回标记数量供审计。
 */
export function markAnalysisJobInterruptedOnRestartOp(params: {
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>;
  onMarkFailed: (iterationId: number, input: AttachmentUploadInput, errorMessage: string, at: string) => void;
  onPersist: (job: AttachmentAnalysisJobRuntime) => void;
  nowIso?: string;
}): number {
  const { analysisJobs, onMarkFailed, onPersist } = params;
  const now = params.nowIso || new Date().toISOString();
  const errorMessage = "进程重启致任务中断，请重试";
  let marked = 0;
  for (const job of analysisJobs.values()) {
    if (job.status !== "running" && job.status !== "queued") continue;
    job.status = "failed";
    job.finishedAt = now;
    job.error = errorMessage;
    job.progress.stageHint = "failed:restart_interrupted";
    onMarkFailed(job.iterationId, job.input, errorMessage, now);
    onPersist(job);
    marked += 1;
  }
  return marked;
}
