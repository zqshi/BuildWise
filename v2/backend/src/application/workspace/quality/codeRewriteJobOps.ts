/**
 * codeRewriteJobOps — 代码改写异步 Job 状态机
 *
 * 把同步的 codeRewrite（LLM 生成文本写盘）改造为异步会话式编码 agent 执行：
 * pending → running → completed/failed/timeout。
 *
 * 状态机纯函数 + in-memory store（Map），与 analysis queueOps 风格一致。
 * 不持有 LLM/agent 依赖，只管状态；执行由 codeRewriteOps 驱动。
 */

import type { CodingAgentEvent } from "../../../domain/shared/codingAgent";

export type CodeRewriteJobStatus = "pending" | "running" | "completed" | "failed" | "timeout" | "cancelled";

export type CodeRewriteEdit = {
  path: string;
  reason: string;
  beforePreview: string;
  afterPreview: string;
};

export type BoundaryViolation = {
  path: string;
  action: "reverted" | "rejected";
};

export type CodeRewriteJob = {
  jobId: string;
  iterationId: number;
  instruction: string;
  repoPath: string;
  boundaryCodePaths: string[];
  role?: string;
  status: CodeRewriteJobStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  sessionId: string;
  events: CodingAgentEvent[];
  edits: CodeRewriteEdit[];
  boundaryViolations: BoundaryViolation[];
  error: string;
};

export type CodeRewriteJobStore = {
  jobs: Map<string, CodeRewriteJob>;
};

export function createCodeRewriteJob(
  store: CodeRewriteJobStore,
  params: {
    jobId: string;
    iterationId: number;
    instruction: string;
    repoPath: string;
    boundaryCodePaths: string[];
    role?: string;
    now: string;
  }
): CodeRewriteJob {
  const job: CodeRewriteJob = {
    jobId: params.jobId,
    iterationId: params.iterationId,
    instruction: params.instruction,
    repoPath: params.repoPath,
    boundaryCodePaths: params.boundaryCodePaths,
    role: params.role,
    status: "pending",
    createdAt: params.now,
    startedAt: "",
    finishedAt: "",
    sessionId: "",
    events: [],
    edits: [],
    boundaryViolations: [],
    error: "",
  };
  store.jobs.set(params.jobId, job);
  return job;
}

export function getCodeRewriteJob(store: CodeRewriteJobStore, jobId: string): CodeRewriteJob | null {
  return store.jobs.get(jobId) ?? null;
}

export function listCodeRewriteJobsByIteration(store: CodeRewriteJobStore, iterationId: number): CodeRewriteJob[] {
  const result: CodeRewriteJob[] = [];
  for (const job of store.jobs.values()) {
    if (job.iterationId === iterationId) result.push(job);
  }
  return result;
}

export function appendJobEvents(store: CodeRewriteJobStore, jobId: string, events: CodingAgentEvent[]): void {
  const job = store.jobs.get(jobId);
  if (!job) return;
  job.events.push(...events);
}

export function markJobRunning(
  store: CodeRewriteJobStore,
  jobId: string,
  params: { sessionId: string; startedAt: string }
): CodeRewriteJob {
  const job = requireJob(store, jobId);
  if (job.status !== "pending") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to running`);
  }
  job.status = "running";
  job.sessionId = params.sessionId;
  job.startedAt = params.startedAt;
  return job;
}

export function markJobCompleted(
  store: CodeRewriteJobStore,
  jobId: string,
  params: {
    finishedAt: string;
    edits: CodeRewriteEdit[];
    boundaryViolations: BoundaryViolation[];
  }
): CodeRewriteJob {
  const job = requireJob(store, jobId);
  if (job.status !== "running") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to completed`);
  }
  job.status = "completed";
  job.finishedAt = params.finishedAt;
  job.edits = params.edits;
  job.boundaryViolations = params.boundaryViolations;
  return job;
}

export function markJobFailed(
  store: CodeRewriteJobStore,
  jobId: string,
  params: { finishedAt: string; error: string }
): CodeRewriteJob {
  const job = requireJob(store, jobId);
  if (job.status !== "running" && job.status !== "pending") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to failed`);
  }
  job.status = "failed";
  job.finishedAt = params.finishedAt;
  job.error = params.error;
  return job;
}

export function markJobTimeout(
  store: CodeRewriteJobStore,
  jobId: string,
  params: { finishedAt: string }
): CodeRewriteJob {
  const job = requireJob(store, jobId);
  if (job.status !== "running") {
    throw new Error(`cannot transition ${jobId} from ${job.status} to timeout`);
  }
  job.status = "timeout";
  job.finishedAt = params.finishedAt;
  job.error = "agent execution timeout";
  return job;
}

function requireJob(store: CodeRewriteJobStore, jobId: string): CodeRewriteJob {
  const job = store.jobs.get(jobId);
  if (!job) {
    throw new Error(`code rewrite job not found: ${jobId}`);
  }
  return job;
}
