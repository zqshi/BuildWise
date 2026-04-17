import type { ChangeEvent } from "react";
import { retryIterationAttachmentAnalysis } from "./workspaceApi";
import { getUploadSession, resumeIterationAttachmentUpload, clearUploadSession } from "./workspaceApiAgentOps";
import { analysisReportCacheKey } from "./useIterationRecovery";
import { toUploadProgress } from "./uploadProgress";
import {
  resolveUploadErrorMessage,
  appendMessage,
  handleUpload,
  type UploadActionDeps
} from "./uploadCore";

/* ── shared: set success state after analysis ────────────────────────── */

const applyAnalysisSuccess = (
  iterationId: number,
  report: unknown,
  deps: UploadActionDeps
) => {
  deps.setAnalysisReport(report as Parameters<typeof deps.setAnalysisReport>[0]);
  try { localStorage.setItem(analysisReportCacheKey(iterationId), JSON.stringify(report)); } catch { /* quota */ }
  deps.setLastUploadFailed(false);
  deps.setShowAnalysisPanel(false);
  deps.setUploadAnalysisProgress((prev) =>
    prev?.stage === "succeeded"
      ? prev
      : {
          stage: "succeeded",
          label: "大模型分析完成",
          detail: "分析报告已生成，可点击\u201C查看分析报告\u201D。",
          percent: 100
        }
  );
};

const applyAnalysisFailure = (
  err: unknown,
  deps: UploadActionDeps,
  failLabel = "大模型分析失败"
) => {
  deps.setLastUploadFailed(true);
  const message = resolveUploadErrorMessage(err);
  if (message.includes("重复上传")) {
    deps.setUploadToastMessage(message);
  }
  deps.setError(message);
  deps.setUploadAnalysisProgress({
    stage: "failed",
    label: failLabel,
    detail: message,
    percent: 15
  });
  return message;
};

/* ── handleRetryUpload ───────────────────────────────────────────────── */

export const handleRetryUpload = async (deps: UploadActionDeps) => {
  if (!deps.currentIteration) return;
  const currentIteration = deps.currentIteration;

  try {
    deps.setUploadToastMessage(null);
    deps.setError(null);
    deps.setLastUploadFailed(false);
    deps.setIsAnalyzingAttachment(true);
    deps.setUploadAnalysisProgress({
      stage: "preparing",
      label: "正在重试分析",
      detail: "正在重新提交上一次失败任务...",
      percent: 5
    });

    const report = await retryIterationAttachmentAnalysis(currentIteration.id, {
      onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
    });
    applyAnalysisSuccess(currentIteration.id, report, deps);

    await appendMessage(
      currentIteration.id,
      "assistant",
      "附件重试分析已完成，点击\u201C查看分析报告\u201D查看项目识别、产品识别与关键发现。",
      deps.setChatMessages
    );
    await deps.loadGovernance();
  } catch (err) {
    const message = applyAnalysisFailure(err, deps);
    try {
      await appendMessage(currentIteration.id, "system", message, deps.setChatMessages);
    } catch (err2) {
      console.warn("[Upload] failed to post secondary message", err2);
    }
  } finally {
    deps.setIsAnalyzingAttachment(false);
  }
};

/* ── handleResumeUpload（断点续传）─────────────────────────────────── */

const validateResumeSession = (
  files: File[],
  sessionFileNames: Set<string>,
  sessionFileCount: number
): boolean => {
  const selectedFileNames = new Set(files.map((f) => f.name));
  const nameOverlap = [...sessionFileNames].filter((n) => selectedFileNames.has(n)).length;
  return nameOverlap >= sessionFileCount * 0.5;
};

export const handleResumeUpload = async (
  event: ChangeEvent<HTMLInputElement>,
  deps: UploadActionDeps
) => {
  if (!deps.currentIteration) return;
  const iteration = deps.currentIteration;
  const session = getUploadSession(iteration.id);
  if (!session) {
    await handleUpload(event, deps);
    return;
  }

  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;
  event.target.value = "";

  const sessionFileNames = new Set(session.files.map((f) => f.fileName));
  if (!validateResumeSession(files, sessionFileNames, session.files.length)) {
    clearUploadSession(iteration.id);
    await handleUpload(event, deps);
    return;
  }

  try {
    deps.setUploadToastMessage(null);
    deps.setError(null);
    deps.setIsAnalyzingAttachment(true);
    deps.setUploadAnalysisProgress({
      stage: "preparing",
      label: "恢复上传中",
      detail: "正在从断点继续上传...",
      percent: 10
    });

    const report = await resumeIterationAttachmentUpload(iteration.id, session, files, {
      onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
    });
    deps.setAnalysisReport(report);
    try { localStorage.setItem(analysisReportCacheKey(iteration.id), JSON.stringify(report)); } catch { /* quota */ }
    deps.setLastUploadFailed(false);
    deps.setShowAnalysisPanel(false);
    deps.setUploadAnalysisProgress({
      stage: "succeeded",
      label: "大模型分析完成",
      detail: "分析报告已生成，可点击\u201C查看分析报告\u201D。",
      percent: 100
    });

    await appendMessage(
      iteration.id,
      "assistant",
      "文档分析完成了，请先确认分析结论是否准确，确认后我会引导你补充需要澄清的信息。",
      deps.setChatMessages
    );
    await deps.loadGovernance();
  } catch (err) {
    clearUploadSession(iteration.id);
    applyAnalysisFailure(err, deps, "上传恢复失败");
  } finally {
    deps.setIsAnalyzingAttachment(false);
  }
};
