/**
 * analysisServiceRetry — 附件分析任务重试查找
 *
 * 从 analysisService 拆出的非导出辅助：retryLatestFailedAttachmentAnalysisJob
 * 的最新失败/任意任务查找 + 可重试输入解析。纯查询逻辑，不持有状态。
 */
import type { AttachmentUploadInput } from '../../../domain/workspace/types';
import type { AttachmentAnalysisJobRuntime } from './queueOps';
import { parseAttachmentInputSnapshot } from '../upload/attachmentUtils';

/**
 * 选指定迭代下最新的 failed 任务（按 finishedAt/createdAt 降序）。
 * 复刻原 Array.from(values()).filter().sort()[0] 逻辑，行为等价。
 */
export function selectLatestFailedAnalysisJob(
  jobs: Iterable<AttachmentAnalysisJobRuntime>,
  iterationId: number
): AttachmentAnalysisJobRuntime | null {
  return (
    Array.from(jobs)
      .filter((job) => job.iterationId === iterationId && job.status === "failed")
      .sort(
        (a, b) =>
          new Date(b.finishedAt || b.createdAt).getTime() - new Date(a.finishedAt || a.createdAt).getTime()
      )[0] ?? null
  );
}

/**
 * 选指定迭代下最新的任意状态任务（按 finishedAt/createdAt 降序）。
 */
export function selectLatestAnalysisJob(
  jobs: Iterable<AttachmentAnalysisJobRuntime>,
  iterationId: number
): AttachmentAnalysisJobRuntime | null {
  return (
    Array.from(jobs)
      .filter((job) => job.iterationId === iterationId)
      .sort(
        (a, b) =>
          new Date(b.finishedAt || b.createdAt).getTime() - new Date(a.finishedAt || a.createdAt).getTime()
      )[0] ?? null
  );
}

/**
 * 解析可重试的分析输入：优先 DB 快照，其次最新失败任务输入，最后最新任意任务输入。
 */
export function resolveRetryableAnalysisInput(
  lastFailedAnalysisInput: string,
  latestFailedJob: AttachmentAnalysisJobRuntime | null,
  latestAnyJob: AttachmentAnalysisJobRuntime | null
): AttachmentUploadInput | null {
  return (
    parseAttachmentInputSnapshot(lastFailedAnalysisInput) ||
    (latestFailedJob ? latestFailedJob.input : null) ||
    (latestAnyJob ? latestAnyJob.input : null)
  );
}
