import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  IterationChangeBoundary,
  IterationCodeRewriteResponse,
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { AgentRunner } from '../shared/agentRunner';
import { runIterationFullCycleOp } from './fullCycleOps';
import { getEffectiveOrchestrationPolicyForProjectOp } from '../governance/policyOps';
import {
  createFullCycleJob,
  markFullCycleCompleted,
  markFullCycleFailed,
  markFullCycleCancelled,
  requestFullCycleCancellation,
  getFullCycleJob,
  listFullCycleJobsByIteration,
  scanInterruptedFullCyclesOp,
  isInterruptedCheckpoint,
  buildInterruptedSummary,
  type FullCycleJobStore,
  type FullCycleJobStatusResponse,
  type InterruptedFullCycleStatusResponse,
} from './fullCycleJobOps';
import { createLogger } from '../../../infrastructure/runtime/logger';
import { writeAuditLog } from '../shared/common';

const log = createLogger("fullcycle-svc");

export type FullCycleDelegates = {
  analyzeAttachment: (iterationId: number, input: AttachmentUploadInput) => Promise<AttachmentAnalysisReport | null>;
  confirmIterationAnalysis: (
    iterationId: number,
    input: {
      accurate: boolean;
      note?: string;
      actor?: string;
      boundary?: Partial<IterationChangeBoundary>;
      resolvedClarificationQuestions?: string[];
    }
  ) => {
    ok: boolean;
    reason?: string;
    unresolvedQuestions?: string[];
    quality?: { score?: number; summary?: string };
  };
  rewriteCodeInBoundary: (
    iterationId: number,
    input: {
      instruction: string;
      dryRun?: boolean;
      maxFiles?: number;
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ) => Promise<IterationCodeRewriteResponse | null>;
  generateIterationTestArtifacts: (
    iterationId: number,
    input: { dryRun?: boolean }
  ) => Promise<IterationTestArtifactsGenerationResponse | null>;
  getIterationReleaseReview: (iterationId: number) => IterationReleaseReviewResponse | null;
  generateIterationDeliveryPackage: (
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null }
  ) => Promise<IterationDeliveryPackageResult | null>;
  publishIterationToRemote: (
    iterationId: number,
    input: {
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    }
  ) => Promise<{ ok: boolean; reason?: string; message?: string; blockers?: string[] }>;
};

export class FullCycleService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly delegates: FullCycleDelegates,
    private readonly agentRunner: AgentRunner | null = null,
    private readonly fullCycleJobStore: FullCycleJobStore | null = null
  ) {}

  async runIterationFullCycle(iterationId: number, input: IterationFullCycleRunInput, shouldCancel?: () => boolean): Promise<IterationFullCycleRunResponse | null> {
    const iteration = this.repo.findIteration(iterationId);
    const activePolicy = iteration ? getEffectiveOrchestrationPolicyForProjectOp(this.repo, iteration.projectId) : null;
    return runIterationFullCycleOp({
      repo: this.repo,
      agentRunner: this.agentRunner,
      iterationId,
      input,
      shouldCancel,
      activePolicy,
      analyzeAttachment: (targetIterationId, analysisInput) => this.delegates.analyzeAttachment(targetIterationId, analysisInput),
      confirmIterationAnalysis: (targetIterationId, confirmInput) => this.delegates.confirmIterationAnalysis(targetIterationId, confirmInput),
      rewriteCodeInBoundary: (targetIterationId, rewriteInput) => this.delegates.rewriteCodeInBoundary(targetIterationId, rewriteInput),
      generateIterationTestArtifacts: (targetIterationId, artifactInput) => this.delegates.generateIterationTestArtifacts(targetIterationId, artifactInput),
      getIterationReleaseReview: (targetIterationId) => this.delegates.getIterationReleaseReview(targetIterationId),
      generateIterationDeliveryPackage: (targetIterationId, deliveryInput) => this.delegates.generateIterationDeliveryPackage(targetIterationId, deliveryInput),
      publishIterationToRemote: (targetIterationId, publishInput) => this.delegates.publishIterationToRemote(targetIterationId, publishInput)
    });
  }

  /**
   * 异步启动 fullCycle 全管道。立即返回 jobId 供前端轮询，后台 fire-and-forget
   * 跑完整管道（runIterationFullCycleOp 自带 checkpoint 持久化与续跑）。
   * 同 iteration 已有 running job 则复用其 jobId（并发锁，幂等）。
   */
  startFullCycleJob(iterationId: number, input: IterationFullCycleRunInput): { jobId: string } | { error: string } {
    if (!this.fullCycleJobStore) return { error: "全流程任务未配置" };
    const existing = listFullCycleJobsByIteration(this.fullCycleJobStore, iterationId)
      .find((j) => j.status === "running");
    if (existing) return { jobId: existing.jobId };
    const jobId = `fc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const now = new Date().toISOString();
    createFullCycleJob(this.fullCycleJobStore, { jobId, iterationId, now });
    void this.runFullCycleJobInBackground(jobId, iterationId, input);
    return { jobId };
  }

  getFullCycleJob(jobId: string) {
    if (!this.fullCycleJobStore) return null;
    return getFullCycleJob(this.fullCycleJobStore, jobId);
  }

  /**
   * 构建 GET 进度查询响应。内存句柄在时镜像句柄并附带当前 checkpoint 进度；
   * 内存句柄丢失（进程重启过）但 iteration 落盘 checkpoint 可续跑时，
   * 返回 status=interrupted + checkpoint 快照；否则返回 null（路由 404）。
   */
  buildFullCycleJobStatus(jobId: string, iterationId: number): FullCycleJobStatusResponse | null {
    const handle = this.getFullCycleJob(jobId);
    const iteration = this.repo.findIteration(iterationId);
    const checkpoint = iteration?.changeControl?.fullCycleCheckpoint ?? null;
    if (handle) {
      return {
        jobId: handle.jobId, iterationId: handle.iterationId, status: handle.status,
        createdAt: handle.createdAt, startedAt: handle.startedAt, finishedAt: handle.finishedAt,
        finalResponse: handle.finalResponse, error: handle.error, checkpoint,
      };
    }
    if (checkpoint?.resumable) {
      return {
        jobId, iterationId, status: "interrupted",
        createdAt: checkpoint.startedAt, startedAt: checkpoint.startedAt,
        finishedAt: checkpoint.lastUpdatedAt, finalResponse: null, error: "",
        checkpoint,
      };
    }
    return null;
  }

  /**
   * 查询某 iteration 是否有中断可续的全流程任务（供前端刷新页面后主动感知）。
   * 复用 isInterruptedCheckpoint 判定 + buildInterruptedSummary 统计步数。无中断时
   * 返回 interrupted=false。不自动续跑，仅提供状态供前端展示续跑入口。
   */
  getInterruptedFullCycle(iterationId: number): InterruptedFullCycleStatusResponse {
    const iteration = this.repo.findIteration(iterationId);
    const checkpoint = iteration?.changeControl?.fullCycleCheckpoint ?? null;
    if (!isInterruptedCheckpoint(checkpoint)) {
      return { interrupted: false, checkpoint: null, completedStepCount: 0, totalStepCount: 0, currentStep: null };
    }
    const summary = buildInterruptedSummary(iterationId, checkpoint);
    return {
      interrupted: true,
      checkpoint,
      completedStepCount: summary.completedStepCount,
      totalStepCount: summary.totalStepCount,
      currentStep: summary.currentStep
    };
  }

  /**
   * 请求取消 running 态 fullCycle job：仅置标志，后台任务在下一个步骤边界停止，
   * 已完成步骤的 checkpoint 保留可续跑。已终态（completed/failed/cancelled）或不存在时返回 ok=false。
   */
  cancelFullCycleJob(jobId: string): { ok: boolean; reason?: string } {
    if (!this.fullCycleJobStore) return { ok: false, reason: "全流程任务未配置" };
    const ok = requestFullCycleCancellation(this.fullCycleJobStore, jobId);
    return ok ? { ok: true } : { ok: false, reason: "任务不存在或已结束" };
  }

  /**
   * 重启恢复：扫描所有 iteration 的 resumable fullCycleCheckpoint，对中断的全流程
   * 任务写审计日志。不预写内存句柄（GET 已动态返回 interrupted）、不自动续跑
   * （后续 step 含改代码/推远程副作用，由用户手动触发 handleResumeFullCycle）。
   */
  restoreInterruptedFullCycles() {
    const summaries = scanInterruptedFullCyclesOp(this.repo);
    for (const s of summaries) {
      writeAuditLog(
        this.repo,
        "fullcycle.restart_recovery",
        `iteration:${s.iterationId}`,
        `重启识别到中断的全流程任务：已完成 ${s.completedStepCount}/${s.totalStepCount} 步，当前停在${s.currentStep ?? "未知"}，可手动续跑`
      );
    }
    if (summaries.length > 0) {
      log.info("重启恢复：识别到中断的全流程任务", { count: summaries.length });
    }
  }

  private async runFullCycleJobInBackground(jobId: string, iterationId: number, input: IterationFullCycleRunInput): Promise<void> {
    if (!this.fullCycleJobStore) return;
    const shouldCancel = () => this.fullCycleJobStore?.jobs.get(jobId)?.cancelRequested === true;
    try {
      const result = await this.runIterationFullCycle(iterationId, input, shouldCancel);
      const handle = this.getFullCycleJob(jobId);
      const finishedAt = new Date().toISOString();
      if (handle?.cancelRequested && result?.status !== "completed") {
        markFullCycleCancelled(this.fullCycleJobStore, jobId, { finishedAt, finalResponse: result });
      } else {
        markFullCycleCompleted(this.fullCycleJobStore, jobId, { finishedAt, finalResponse: result });
      }
    } catch (error) {
      markFullCycleFailed(this.fullCycleJobStore, jobId, {
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
