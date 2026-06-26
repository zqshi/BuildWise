/**
 * fullCycleJobOps — fullCycle 全管道异步 Job 句柄状态机
 *
 * fullCycle 全管道含 5-6 次 LLM/agent 执行，可达 30min+，不能阻塞 HTTP。
 * POST 触发立即返回 jobId，后台 fire-and-forget 跑 runIterationFullCycleOp
 * （它自己持久化 iteration.changeControl.fullCycleCheckpoint）。
 *
 * 本文件只管内存态 job 句柄（jobId↔iterationId↔status↔最终response），
 * 不持久化——进度 source of truth 是 checkpoint（已落盘）。进程重启后内存
 * 句柄丢失，GET 端点回查 checkpoint 返回 interrupted 快照（自动恢复留 T10）。
 *
 * 复用 codeRewriteJobOps 的纯内存 Map 模式，不新造持久化轮子。
 */

import type { IterationFullCycleRunResponse } from '../../../domain/workspace/types';
import type { FullCycleCheckpoint, FullCycleStepId } from '../../../domain/workspace/iterationTypes';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';

/** 内存句柄的实际状态：创建即 running，终态 completed/failed。 */
export type FullCycleJobStatus = "running" | "completed" | "failed" | "cancelled";

export type FullCycleJobHandle = {
  jobId: string;
  iterationId: number;
  status: FullCycleJobStatus;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  finalResponse: IterationFullCycleRunResponse | null;
  error: string;
};

export type FullCycleJobStore = {
  jobs: Map<string, FullCycleJobHandle>;
};

/**
 * GET 进度查询响应。句柄在内存时镜像句柄；内存丢失但 checkpoint 落盘在
 * iteration.changeControl.fullCycleCheckpoint 且 resumable 时，返回 status=interrupted
 * + checkpoint 快照，让前端不丢进度可见性（自动续跑留 T10）。
 */
export type FullCycleJobStatusResponse = {
  jobId: string;
  iterationId: number;
  status: FullCycleJobStatus | "interrupted";
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  finalResponse: IterationFullCycleRunResponse | null;
  error: string;
  checkpoint: FullCycleCheckpoint | null;
};

export function createFullCycleJob(
  store: FullCycleJobStore,
  params: { jobId: string; iterationId: number; now: string }
): FullCycleJobHandle {
  const job: FullCycleJobHandle = {
    jobId: params.jobId,
    iterationId: params.iterationId,
    status: "running",
    cancelRequested: false,
    createdAt: params.now,
    startedAt: params.now,
    finishedAt: "",
    finalResponse: null,
    error: "",
  };
  store.jobs.set(params.jobId, job);
  return job;
}

export function getFullCycleJob(store: FullCycleJobStore, jobId: string): FullCycleJobHandle | null {
  return store.jobs.get(jobId) ?? null;
}

export function listFullCycleJobsByIteration(store: FullCycleJobStore, iterationId: number): FullCycleJobHandle[] {
  const result: FullCycleJobHandle[] = [];
  for (const job of store.jobs.values()) {
    if (job.iterationId === iterationId) result.push(job);
  }
  return result;
}

export function markFullCycleCompleted(
  store: FullCycleJobStore,
  jobId: string,
  params: { finishedAt: string; finalResponse: IterationFullCycleRunResponse | null }
): FullCycleJobHandle {
  const job = requireJob(store, jobId);
  if (job.status !== "running") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to completed`);
  }
  job.status = "completed";
  job.finishedAt = params.finishedAt;
  job.finalResponse = params.finalResponse;
  return job;
}

export function markFullCycleFailed(
  store: FullCycleJobStore,
  jobId: string,
  params: { finishedAt: string; error: string }
): FullCycleJobHandle {
  const job = requireJob(store, jobId);
  if (job.status !== "running") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to failed`);
  }
  job.status = "failed";
  job.finishedAt = params.finishedAt;
  job.error = params.error;
  return job;
}

/**
 * 请求取消 running 态 job：仅置 cancelRequested 标志，后台任务在下一个步骤边界
 * 检查该标志后停止。已终态（completed/failed/cancelled）或不存在时返回 false。
 */
export function requestFullCycleCancellation(store: FullCycleJobStore, jobId: string): boolean {
  const job = store.jobs.get(jobId);
  if (!job || job.status !== "running") return false;
  job.cancelRequested = true;
  return true;
}

export function markFullCycleCancelled(
  store: FullCycleJobStore,
  jobId: string,
  params: { finishedAt: string; finalResponse: IterationFullCycleRunResponse | null }
): FullCycleJobHandle {
  const job = requireJob(store, jobId);
  if (job.status !== "running") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to cancelled`);
  }
  job.status = "cancelled";
  job.finishedAt = params.finishedAt;
  job.finalResponse = params.finalResponse;
  return job;
}

function requireJob(store: FullCycleJobStore, jobId: string): FullCycleJobHandle {
  const job = store.jobs.get(jobId);
  if (!job) {
    throw new Error(`fullcycle job not found: ${jobId}`);
  }
  return job;
}

export type InterruptedFullCycleSummary = {
  iterationId: number;
  startedAt: string;
  lastUpdatedAt: string;
  currentStep: FullCycleStepId | null;
  completedStepCount: number;
  totalStepCount: number;
};

/** checkpoint 处于「可续跑且未完成」的中断态：重启后内存句柄丢失但进度落盘在此。 */
export function isInterruptedCheckpoint(checkpoint: FullCycleCheckpoint | null | undefined): checkpoint is FullCycleCheckpoint {
  return !!checkpoint && !!checkpoint.resumable && !checkpoint.completedAt;
}

/** 从中断 checkpoint 构建摘要（已完成步数 / 总步数 / 当前停留步骤）。 */
export function buildInterruptedSummary(iterationId: number, checkpoint: FullCycleCheckpoint): InterruptedFullCycleSummary {
  const steps = checkpoint.steps ?? {};
  const stepList = Object.values(steps);
  return {
    iterationId,
    startedAt: checkpoint.startedAt ?? "",
    lastUpdatedAt: checkpoint.lastUpdatedAt ?? "",
    currentStep: checkpoint.currentStep ?? null,
    completedStepCount: stepList.filter((s) => s?.status === "completed").length,
    totalStepCount: stepList.length
  };
}

/** GET /iterations/:id/full-cycle/interrupted 响应：该迭代是否有中断可续的全流程任务。 */
export type InterruptedFullCycleStatusResponse = {
  interrupted: boolean;
  checkpoint: FullCycleCheckpoint | null;
  completedStepCount: number;
  totalStepCount: number;
  currentStep: FullCycleStepId | null;
};

/**
 * 重启扫描：进程重启后 fullCycleJobStore 纯内存句柄丢失，但 iteration 落盘的
 * fullCycleCheckpoint（resumable=true 且未完成）仍在。GET 端点已能动态返回 interrupted
 * （T9），本函数在启动时扫描所有这类中断 checkpoint 供审计日志记录——不修改 checkpoint
 * （已是 interrupted/resumable 态），不自动续跑（后续 step 含改代码/推远程副作用，
 * 由用户手动触发 handleResumeFullCycle）。返回中断任务摘要列表。
 */
export function scanInterruptedFullCyclesOp(repo: WorkspaceRepository): InterruptedFullCycleSummary[] {
  const summaries: InterruptedFullCycleSummary[] = [];
  for (const project of repo.listProjects()) {
    for (const iter of repo.listIterations(project.id)) {
      const checkpoint = iter.changeControl?.fullCycleCheckpoint;
      if (!isInterruptedCheckpoint(checkpoint)) continue;
      summaries.push(buildInterruptedSummary(iter.id, checkpoint));
    }
  }
  return summaries;
}
