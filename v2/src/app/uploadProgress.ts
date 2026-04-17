import type { AttachmentAnalysisJob } from "../domain/workspace/types";
import type { UploadAnalysisProgress } from "../domain/workspace/analysisTypes";

/* ── toUploadProgress ──────────────────────────────────────────────── */

const computeBatchPercent = (job: AttachmentAnalysisJob) => {
  const totalBatches = Math.max(1, job.progress.totalBatches || 1);
  const completedBatches = Math.min(totalBatches, Math.max(0, job.progress.completedBatches || 0));
  const failedBatches = Math.max(0, job.progress.failedBatches || 0);
  const effectiveDoneBatches = Math.min(totalBatches, completedBatches + failedBatches);
  return {
    totalBatches,
    effectiveDoneBatches,
    percentByBatches: Math.round((effectiveDoneBatches / totalBatches) * 100)
  };
};

const computeFilePercent = (job: AttachmentAnalysisJob) => {
  const totalFiles = Math.max(1, job.progress.totalFiles || 1);
  const processedFiles = Math.min(totalFiles, Math.max(0, job.progress.processedFiles || 0));
  return {
    totalFiles,
    processedFiles,
    percentByFiles: Math.round((processedFiles / totalFiles) * 100)
  };
};

const buildRunningProgress = (
  job: AttachmentAnalysisJob,
  ctx: { effectiveDoneBatches: number; totalBatches: number; processedFiles: number; totalFiles: number; basePercent: number }
): UploadAnalysisProgress => {
  const llmCallCount = Math.max(0, job.progress.llmCallCount || 0);
  const llmInFlightCount = Math.max(0, job.progress.llmInFlightCount || 0);
  const llmFailureCount = Math.max(0, job.progress.llmFailureCount || 0);
  const llmLastCallTime = job.progress.lastLlmCallAt
    ? new Date(job.progress.lastLlmCallAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "\u65E0";
  const batchLabel = `${Math.min(ctx.effectiveDoneBatches + 1, ctx.totalBatches)}/${ctx.totalBatches}`;
  const fileLabel = `${ctx.processedFiles}/${ctx.totalFiles}`;
  return {
    stage: "running",
    label: "\u6B63\u5728\u8C03\u7528\u5927\u6A21\u578B\u5206\u6790",
    detail: `\u6279\u6B21 ${batchLabel} \xB7 \u5DF2\u5904\u7406 ${fileLabel} \u6587\u4EF6 \xB7 LLM\u8C03\u7528 ${llmCallCount} \u6B21\uFF08\u8FDB\u884C\u4E2D ${llmInFlightCount} / \u5931\u8D25 ${llmFailureCount}\uFF09\xB7 \u6700\u8FD1\u8C03\u7528 ${llmLastCallTime}`,
    percent: Math.max(12, Math.min(96, ctx.basePercent)),
    jobId: job.jobId
  };
};

export const toUploadProgress = (job: AttachmentAnalysisJob): UploadAnalysisProgress => {
  const { totalBatches, effectiveDoneBatches, percentByBatches } = computeBatchPercent(job);
  const { totalFiles, processedFiles, percentByFiles } = computeFilePercent(job);
  const basePercent = Math.max(percentByBatches, percentByFiles);

  if (job.status === "queued") {
    return { stage: "queued", label: "\u5206\u6790\u4EFB\u52A1\u5DF2\u521B\u5EFA\uFF0C\u7B49\u5F85\u6267\u884C", detail: "\u4EFB\u52A1\u5DF2\u8FDB\u5165\u961F\u5217\uFF0C\u7A0D\u540E\u5F00\u59CB\u8C03\u7528\u5927\u6A21\u578B\u3002", percent: 8, jobId: job.jobId };
  }
  if (job.status === "running") {
    return buildRunningProgress(job, { effectiveDoneBatches, totalBatches, processedFiles, totalFiles, basePercent });
  }
  if (job.status === "succeeded") {
    return { stage: "succeeded", label: "\u5927\u6A21\u578B\u5206\u6790\u5B8C\u6210", detail: `\u5171\u5904\u7406 ${processedFiles}/${totalFiles} \u6587\u4EF6\uFF0C\u53EF\u67E5\u770B\u5206\u6790\u62A5\u544A\u3002`, percent: 100, jobId: job.jobId };
  }
  if (job.status === "partial_succeeded") {
    const detail = job.warnings.length > 0
      ? `\u5DF2\u5904\u7406 ${processedFiles}/${totalFiles} \u6587\u4EF6\uFF0C\u90E8\u5206\u6279\u6B21\u5931\u8D25\uFF1A${job.warnings[0]}`
      : `\u5DF2\u5904\u7406 ${processedFiles}/${totalFiles} \u6587\u4EF6\uFF0C\u5B58\u5728\u90E8\u5206\u672A\u5B8C\u6210\u9879\u3002`;
    return { stage: "succeeded", label: "\u5206\u6790\u90E8\u5206\u5B8C\u6210", detail, percent: 100, jobId: job.jobId };
  }
  return { stage: "failed", label: "\u5927\u6A21\u578B\u5206\u6790\u5931\u8D25", detail: job.error || "\u5206\u6790\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", percent: Math.max(10, basePercent), jobId: job.jobId };
};
