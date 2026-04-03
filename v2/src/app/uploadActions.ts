import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  ChatRole,
  Iteration,
  IterationMessage
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import {
  analyzeIterationAttachment,
  analyzeIterationAttachmentFolder,
  retryIterationAttachmentAnalysis,
  updateIterationInteractionState,
  createIterationMessage
} from "./workspaceApi";
import { getUploadSession, resumeIterationAttachmentUpload, clearUploadSession } from "./workspaceApiAgentOps";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { type FileWithPath, getFilePath } from "../shared/fileTypes";

/* ── pure helpers (no deps) ──────────────────────────────────────────── */

export const buildAutoFullCycleAnalysisInput = (
  currentIteration: Iteration | null,
  analysisReport: AttachmentAnalysisReport | null,
  uploadedFile: UploadedAttachmentMeta | null
) => {
  if (!currentIteration) {
    return undefined;
  }
  const hasCachedAnalysis = Boolean(analysisReport?.iterationId === currentIteration.id);
  const canAutoAnalyzeFromUpload =
    !hasCachedAnalysis &&
    Boolean(uploadedFile) &&
    ((uploadedFile?.htmlPreviews?.length || 0) > 0 || (uploadedFile?.imagePreviews?.length || 0) > 0);
  if (!canAutoAnalyzeFromUpload) {
    return undefined;
  }
  const firstHtmlPreview = uploadedFile?.htmlPreviews?.[0];
  const firstImagePreview = uploadedFile?.imagePreviews?.[0];
  return {
    fileName: uploadedFile?.name || "uploaded-asset",
    mimeType: firstHtmlPreview ? "text/html" : "image/*",
    size: firstHtmlPreview?.content?.length || firstImagePreview?.dataUrl?.length || 0,
    excerpt: (firstHtmlPreview?.content || "").slice(0, 4000),
    sourceType: "single-file" as const,
    visionPayloads: firstImagePreview?.dataUrl
      ? [
          {
            path: firstImagePreview.path || firstImagePreview.name || uploadedFile?.name || "uploaded-image",
            mimeType: "image/*",
            dataUrl: firstImagePreview.dataUrl
          }
        ]
      : [],
    agentScope: "full-cycle" as const,
    forceMultiAgent: true
  };
};

export const resolveUploadErrorMessage = (error: unknown) => {
  const raw = resolveErrorMessage(error);
  if (raw.includes("llm_preflight_not_configured")) {
    return "附件分析失败：AI 服务未配置。请联系管理员完成配置。";
  }
  if (raw.includes("llm_preflight_unreachable")) {
    return "附件分析失败：AI 服务当前不可用（鉴权或网络异常）。请联系管理员检查服务连通性后重试。";
  }
  if (raw.includes("request timeout")) {
    return "附件分析失败：请求超时（分析耗时过长）。请减少单次上传文件数量后重试。";
  }
  if (raw.includes("analysis job timeout")) {
    return "附件分析失败：任务执行超时（异步分析未在时限内完成）。建议拆分文件夹后重试。";
  }
  if (raw.includes("analysis job failed")) {
    return "附件分析失败：异步任务执行失败。请重试，若持续失败请检查后端日志。";
  }
  if (raw.includes("report_not_llm_quality")) {
    return "附件分析失败：大模型输出质量不足（已禁止兜底文案）。请补充更清晰的业务文档后重试。";
  }
  if (raw.includes("analysis job stalled")) {
    return "附件分析失败：任务长时间无进展，已自动终止以避免卡住。请拆分文件夹或稍后重试。";
  }
  if (raw.includes("analysis job polling failed")) {
    return `附件分析失败：任务状态轮询异常，已自动停止等待。请检查后端服务后重试。详情：${raw}`;
  }
  if (raw.includes("API error: 503")) {
    return "附件分析失败：AI 服务未配置。请联系管理员先完成配置。";
  }
  if (raw.includes("API error: 404") && (raw.includes("job") || raw.includes("retry"))) {
    return "附件分析重试失败：未找到可重试的分析任务。请重新上传文件。";
  }
  if (raw.includes("API error: 404")) {
    return "附件分析失败：请求的资源不存在，请刷新页面后重试。";
  }
  if (raw.includes("API error: 409") || raw.includes("duplicate_upload")) {
    return "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。";
  }
  if (raw.includes("aborted")) {
    return "附件分析失败：AI 服务响应超时（后端已中断本次调用）。请重试或联系管理员调整超时配置。";
  }
  if (raw.includes("API error: 502")) {
    return "附件分析失败：大模型调用异常，请稍后重试或检查模型服务可达性。";
  }
  if (raw.includes("network unavailable")) {
    return "附件分析失败：后端服务不可达，请检查后端是否已启动。";
  }
  return raw;
};

export const handleUploadClick = (
  currentIteration: Iteration | null,
  fileInputRef: RefObject<HTMLInputElement>
) => {
  if (!currentIteration) {
    return;
  }
  fileInputRef.current?.click();
};

export const toUploadProgress = (job: AttachmentAnalysisJob): UploadAnalysisProgress => {
  const totalBatches = Math.max(1, job.progress.totalBatches || 1);
  const completedBatches = Math.min(totalBatches, Math.max(0, job.progress.completedBatches || 0));
  const failedBatches = Math.max(0, job.progress.failedBatches || 0);
  const effectiveDoneBatches = Math.min(totalBatches, completedBatches + failedBatches);
  const percentByBatches = Math.round((effectiveDoneBatches / totalBatches) * 100);
  const totalFiles = Math.max(1, job.progress.totalFiles || 1);
  const processedFiles = Math.min(totalFiles, Math.max(0, job.progress.processedFiles || 0));
  const percentByFiles = Math.round((processedFiles / totalFiles) * 100);
  const basePercent = Math.max(percentByBatches, percentByFiles);
  if (job.status === "queued") {
    return {
      stage: "queued",
      label: "分析任务已创建，等待执行",
      detail: "任务已进入队列，稍后开始调用大模型。",
      percent: 8,
      jobId: job.jobId
    };
  }
  if (job.status === "running") {
    const llmCallCount = Math.max(0, job.progress.llmCallCount || 0);
    const llmInFlightCount = Math.max(0, job.progress.llmInFlightCount || 0);
    const llmFailureCount = Math.max(0, job.progress.llmFailureCount || 0);
    const llmLastCallTime = job.progress.lastLlmCallAt
      ? new Date(job.progress.lastLlmCallAt).toLocaleTimeString("zh-CN", { hour12: false })
      : "无";
    return {
      stage: "running",
      label: "正在调用大模型分析",
      detail: `批次 ${Math.min(effectiveDoneBatches + 1, totalBatches)}/${totalBatches} · 已处理 ${processedFiles}/${totalFiles} 文件 · LLM调用 ${llmCallCount} 次（进行中 ${llmInFlightCount} / 失败 ${llmFailureCount}）· 最近调用 ${llmLastCallTime}`,
      percent: Math.max(12, Math.min(96, basePercent)),
      jobId: job.jobId
    };
  }
  if (job.status === "succeeded") {
    return {
      stage: "succeeded",
      label: "大模型分析完成",
      detail: `共处理 ${processedFiles}/${totalFiles} 文件，可查看分析报告。`,
      percent: 100,
      jobId: job.jobId
    };
  }
  if (job.status === "partial_succeeded") {
    return {
      stage: "succeeded",
      label: "分析部分完成",
      detail:
        job.warnings.length > 0
          ? `已处理 ${processedFiles}/${totalFiles} 文件，部分批次失败：${job.warnings[0]}`
          : `已处理 ${processedFiles}/${totalFiles} 文件，存在部分未完成项。`,
      percent: 100,
      jobId: job.jobId
    };
  }
  return {
    stage: "failed",
    label: "大模型分析失败",
    detail: job.error || "分析任务失败，请重试。",
    percent: Math.max(10, basePercent),
    jobId: job.jobId
  };
};

export const resolveFolderName = (files: File[]) => {
  const firstPath = ((files[0] as FileWithPath).webkitRelativePath || "").trim();
  if (firstPath.includes("/")) {
    return firstPath.split("/")[0];
  }
  return "attachments";
};

export const hashFingerprint = (raw: string) => {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const buildUploadFingerprint = (files: File[]) => {
  const hasFolderPath = files.some((item) => Boolean((item as FileWithPath).webkitRelativePath));
  const sourceType = hasFolderPath || files.length > 1 ? "folder" : "single-file";
  const normalizedFiles = files
    .map((item) => ({
      path: (getFilePath(item) || "").trim(),
      name: (item.name || "").trim(),
      size: Number.isFinite(item.size) ? item.size : 0,
      type: (item.type || "").trim().toLowerCase(),
      lastModified: Number.isFinite(item.lastModified) ? item.lastModified : 0
    }))
    .sort((a, b) => `${a.path}|${a.name}`.localeCompare(`${b.path}|${b.name}`));
  const raw = JSON.stringify({ sourceType, files: normalizedFiles });
  return `afp-${hashFingerprint(raw)}`;
};

export const isDocumentAsset = (file: File) => {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("pdf") ||
    type.includes("word") ||
    type.includes("markdown") ||
    type.includes("json") ||
    type.includes("javascript") ||
    type.includes("typescript") ||
    type.includes("xml") ||
    type.includes("yaml") ||
    name.endsWith(".md") ||
    name.endsWith(".txt") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    name.endsWith(".pdf") ||
    name.endsWith(".js") ||
    name.endsWith(".ts") ||
    name.endsWith(".jsx") ||
    name.endsWith(".tsx") ||
    name.endsWith(".css") ||
    name.endsWith(".scss") ||
    name.endsWith(".less") ||
    name.endsWith(".json") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml") ||
    name.endsWith(".xml") ||
    name.endsWith(".py") ||
    name.endsWith(".java") ||
    name.endsWith(".go") ||
    name.endsWith(".rs") ||
    name.endsWith(".rb") ||
    name.endsWith(".sh") ||
    name.endsWith(".sql") ||
    name.endsWith(".csv") ||
    name.endsWith(".vue") ||
    name.endsWith(".svelte") ||
    name.endsWith(".swift") ||
    name.endsWith(".kt") ||
    name.endsWith(".c") ||
    name.endsWith(".cpp") ||
    name.endsWith(".h") ||
    name.endsWith(".proto") ||
    name.endsWith(".toml") ||
    name.endsWith(".ini") ||
    name.endsWith(".env") ||
    name.endsWith(".gitignore")
  );
};

export const isPrototypeAsset = (file: File) => {
  const name = file.name.toLowerCase();
  const path = ((file as FileWithPath).webkitRelativePath || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const marker = `${name} ${path}`;
  return (
    type.startsWith("image/") ||
    type.includes("svg") ||
    name.endsWith(".fig") ||
    name.endsWith(".sketch") ||
    name.endsWith(".xd") ||
    name.endsWith(".html") ||
    name.endsWith(".htm") ||
    /prototype|wireframe|mockup|交互|原型|界面|figma/.test(marker)
  );
};

/* ── deps type for stateful upload functions ─────────────────────────── */

export type UploadActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  setLastUploadFailed: Dispatch<SetStateAction<boolean>>;
  lastUploadAttemptRef: React.MutableRefObject<{ iterationId: number; files: File[] } | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadedFile: Dispatch<SetStateAction<UploadedAttachmentMeta | null>>;
  setUploadToastMessage: Dispatch<SetStateAction<string | null>>;
  setIsAnalyzingAttachment: Dispatch<SetStateAction<boolean>>;
  setUploadAnalysisProgress: Dispatch<SetStateAction<UploadAnalysisProgress | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

/* ── helper shared by uploadFiles / handleRetryUpload ────────────────── */

const appendMessage = async (iterationId: number, role: ChatRole, content: string, setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>) => {
  const created = await createIterationMessage(iterationId, role, content);
  setChatMessages((prev) => [...prev, created]);
};

/* ── uploadFiles ─────────────────────────────────────────────────────── */

export const uploadFiles = async (files: File[], deps: UploadActionDeps) => {
  if (files.length === 0) {
    return;
  }
  if (!deps.currentIteration) {
    return;
  }
  const currentIteration = deps.currentIteration;
  deps.setLastUploadFailed(false);
  deps.lastUploadAttemptRef.current = {
    iterationId: currentIteration.id,
    files: [...files]
  };
  // Flag to cancel the deferred loadIterations if upload completes/fails before it fires.
  // Without this, a fast-failing upload (e.g. 409 duplicate) finishes before the 800ms timer,
  // causing isAnalyzingAttachment to be false when loadIterations runs, which bypasses the
  // useEffect guard and wipes iteration state / navigates back to project panel.
  let deferredRefreshActive = true;
  const hasFolderPath = files.some((item) => Boolean((item as FileWithPath).webkitRelativePath));
  const isBatch = hasFolderPath || files.length > 1;
  const folderName = resolveFolderName(files);
  const uploadFingerprint = buildUploadFingerprint(files);
  const latestIterationFingerprint = currentIteration.changeControl?.lastUploadedInputFingerprint?.trim() || "";
  if (latestIterationFingerprint && latestIterationFingerprint === uploadFingerprint) {
    const duplicateMessage = "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。";
    deps.setUploadToastMessage(duplicateMessage);
    deps.setError(null);
    deps.setUploadAnalysisProgress(null);
    return;
  }
  const hasDocumentAssets = files.some(isDocumentAsset);
  const hasPrototypeAssets = files.some(isPrototypeAsset);
  const uploadKind = hasDocumentAssets && hasPrototypeAssets ? "mixed" : hasDocumentAssets ? "documents" : hasPrototypeAssets ? "prototype" : "other";
  const prototypeItems = files
    .map((item) => (getFilePath(item) || "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => /prototype|wireframe|mockup|交互|原型|界面|figma|\.fig$|\.xd$|\.sketch$|\.html?$|\.png$|\.jpg$|\.jpeg$|\.svg$/i.test(item))
    .slice(0, 12);
  const htmlPreviewCandidates = files.filter((item) => {
    const name = (item.name || "").toLowerCase();
    return /\.html?$/.test(name) || (/\.(md|markdown|txt|csv|json|xml|yaml|yml|toml|rst|adoc)$/i.test(name) && isDocumentAsset(item));
  }).slice(0, 3);
  const htmlPreviews = (
    await Promise.all(
      htmlPreviewCandidates.map(async (item) => {
        try {
          const content = await item.text();
          if (!content.trim()) {
            return null;
          }
          const cappedContent = content.length > 300_000 ? content.slice(0, 300_000) : content;
          const path = (getFilePath(item) || "").trim();
          return {
            name: item.name,
            path: path || item.name,
            content: cappedContent
          };
        } catch {
          return null;
        }
      })
    )
  ).filter((item): item is { name: string; path: string; content: string } => Boolean(item));
  const imagePreviewCandidates = files.filter((item) => /^image\//i.test(item.type || "") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.name || "")).slice(0, 6);
  const imagePreviews = (
    await Promise.all(
      imagePreviewCandidates.map(
        (item) =>
          new Promise<{ name: string; path: string; dataUrl: string } | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = typeof reader.result === "string" ? reader.result : "";
              if (!dataUrl) {
                resolve(null);
                return;
              }
              const path = (getFilePath(item) || "").trim();
              resolve({
                name: item.name,
                path: path || item.name,
                dataUrl
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(item);
          })
      )
    )
  ).filter((item): item is { name: string; path: string; dataUrl: string } => Boolean(item));
  deps.setUploadedFile({
    name: isBatch ? `${folderName} (${files.length} files)` : files[0].name,
    iterationId: currentIteration.id,
    uploadFingerprint,
    hasDocumentAssets,
    hasPrototypeAssets,
    uploadKind,
    prototypeItems,
    htmlPreviews,
    imagePreviews
  });
  try {
    await updateIterationInteractionState(currentIteration.id, {
      hasPrototypeAssets,
      uploadKind,
      lastAttachmentName: isBatch ? `${folderName} (${files.length} files)` : files[0].name
    });
    // Defer loadIterations to refresh the iteration list with updated interactionState badge.
    const refreshProjectId = deps.currentProjectId ?? currentIteration.projectId;
    setTimeout(() => {
      if (!deferredRefreshActive) return;
      deps.loadIterations(refreshProjectId).catch((e) =>
        console.warn("[Upload] deferred iteration refresh failed", e)
      );
    }, 800);
  } catch (err) {
    console.warn("[Upload] interaction state persistence failed, continuing upload flow", err);
  }
  try {
    deps.setUploadToastMessage(null);
    deps.setIsAnalyzingAttachment(true);
    deps.setUploadAnalysisProgress({
      stage: "preparing",
      label: "正在准备上传内容",
      detail: "正在读取文件并构建分析上下文...",
      percent: 5
    });
    try {
      const uploadLabel =
        hasDocumentAssets && !hasPrototypeAssets
          ? "文档"
          : hasPrototypeAssets && !hasDocumentAssets
            ? "原型"
            : "附件";
      const displayText = isBatch
        ? `已上传${uploadLabel}：${folderName}（${files.length} 个文件）`
        : `已上传${uploadLabel}：${files[0].name}`;
      const fileEntries = await Promise.all(files.slice(0, 30).map(async (f) => {
        const entry: {
          name: string; path: string; size: number; type: string;
          content?: string; dataUrl?: string;
        } = {
          name: f.name,
          path: getFilePath(f) || f.name,
          size: f.size,
          type: f.type || ""
        };
        try {
          const isText = isDocumentAsset(f) && !f.name.toLowerCase().endsWith(".pdf")
            && !f.name.toLowerCase().endsWith(".doc") && !f.name.toLowerCase().endsWith(".docx");
          if (isText && f.size <= 200_000) {
            entry.content = await f.text();
          } else if (f.type.startsWith("image/") && f.size <= 500_000) {
            entry.dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(f);
            });
          }
        } catch { /* ignore read errors, keep metadata only */ }
        return entry;
      }));
      const uploadMeta = JSON.stringify({
        kind: uploadKind,
        sourceType: isBatch ? "folder" : "single-file",
        folderName: isBatch ? folderName : undefined,
        totalFiles: files.length,
        files: fileEntries
      });
      const encodedMeta = btoa(unescape(encodeURIComponent(uploadMeta)));
      await appendMessage(
        currentIteration.id,
        "system",
        `${displayText}\n<!-- upload-b64:${encodedMeta} -->`,
        deps.setChatMessages
      );
    } catch (err) {
      console.warn("[Upload] failed to post upload event message", err);
    }
    if (hasPrototypeAssets && !hasDocumentAssets) {
      deps.setLastUploadFailed(false);
      deps.setAnalysisReport(null);
      deps.setShowAnalysisPanel(false);
      deps.setUploadAnalysisProgress({
        stage: "succeeded",
        label: "原型已上传",
        detail: "仅原型素材无需调用大模型分析，可直接进入交互渲染模式。",
        percent: 100
      });
      await appendMessage(
        currentIteration.id,
        "assistant",
        htmlPreviews.length > 0
          ? "检测到 HTML 原型附件，已进入交互渲染模式。你可以点击“交互界面”查看上传的页面。"
          : "检测到可交互原型附件，已进入交互渲染模式。你可以点击“交互界面”并选中元素后，通过 IM 描述修改指令。",
        deps.setChatMessages
      );
      return;
    }
    const report = isBatch
      ? await analyzeIterationAttachmentFolder(currentIteration.id, files, {
          folderName,
          agentScope: "full-cycle",
          forceMultiAgent: true,
          autoTransition: false,
          onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
        })
      : await analyzeIterationAttachment(currentIteration.id, files[0], {
          agentScope: "full-cycle",
          forceMultiAgent: true,
          autoTransition: false,
          onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
        });
    deps.setAnalysisReport(report);
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
    await appendMessage(
      currentIteration.id,
      "assistant",
      "文档分析完成了，请先确认分析结论是否准确，确认后我会引导你补充需要澄清的信息。",
      deps.setChatMessages
    );
    await deps.loadGovernance();
  } catch (err) {
    deps.setLastUploadFailed(true);
    const message = resolveUploadErrorMessage(err);
    if (message.includes("重复上传")) {
      deps.setUploadToastMessage(message);
    }
    deps.setError(message);
    deps.setUploadAnalysisProgress({
      stage: "failed",
      label: "大模型分析失败",
      detail: message,
      percent: 15
    });
    try {
      await appendMessage(currentIteration.id, "system", message, deps.setChatMessages);
    } catch (err) {
      console.warn("[Upload] failed to post secondary message", err);
    }
  } finally {
    deferredRefreshActive = false;
    deps.setIsAnalyzingAttachment(false);
  }
};

/* ── handleUpload ────────────────────────────────────────────────────── */

export const handleUpload = async (event: ChangeEvent<HTMLInputElement>, deps: UploadActionDeps) => {
  const files = Array.from(event.target.files || []);
  await uploadFiles(files, deps);
  event.target.value = "";
};

/* ── handleRetryUpload ───────────────────────────────────────────────── */

export const handleRetryUpload = async (deps: UploadActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
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
    deps.setAnalysisReport(report);
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
    await appendMessage(
      currentIteration.id,
      "assistant",
      "附件重试分析已完成，点击\u201C查看分析报告\u201D查看项目识别、产品识别与关键发现。",
      deps.setChatMessages
    );
    await deps.loadGovernance();
  } catch (err) {
    deps.setLastUploadFailed(true);
    const message = resolveUploadErrorMessage(err);
    if (message.includes("重复上传")) {
      deps.setUploadToastMessage(message);
    }
    deps.setError(message);
    deps.setUploadAnalysisProgress({
      stage: "failed",
      label: "大模型分析失败",
      detail: message,
      percent: 15
    });
    try {
      await appendMessage(currentIteration.id, "system", message, deps.setChatMessages);
    } catch (err) {
      console.warn("[Upload] failed to post secondary message", err);
    }
  } finally {
    deps.setIsAnalyzingAttachment(false);
  }
};

/* ── handleResumeUpload（断点续传）─────────────────────────────────── */

export const handleResumeUpload = async (event: ChangeEvent<HTMLInputElement>, deps: UploadActionDeps) => {
  if (!deps.currentIteration) return;
  const iteration = deps.currentIteration;
  const session = getUploadSession(iteration.id);
  if (!session) {
    // 无会话可恢复，走普通上传流程
    await handleUpload(event, deps);
    return;
  }

  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;
  event.target.value = "";

  // 通过文件名匹配验证是否为同一批文件
  const sessionFileNames = new Set(session.files.map((f) => f.fileName));
  const selectedFileNames = new Set(files.map((f) => f.name));
  const nameOverlap = [...sessionFileNames].filter((n) => selectedFileNames.has(n)).length;
  if (nameOverlap < session.files.length * 0.5) {
    // 文件差异太大，放弃续传
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
    deps.setLastUploadFailed(true);
    const message = resolveUploadErrorMessage(err);
    deps.setError(message);
    deps.setUploadAnalysisProgress({
      stage: "failed",
      label: "上传恢复失败",
      detail: message,
      percent: 15
    });
  } finally {
    deps.setIsAnalyzingAttachment(false);
  }
};
