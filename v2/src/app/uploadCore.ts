import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
  ChatRole,
  Iteration,
  IterationMessage
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import {
  analyzeIterationAttachment,
  analyzeIterationAttachmentFolder,
  updateIterationInteractionState,
  createIterationMessage
} from "./workspaceApi";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { type FileWithPath, getFilePath } from "../shared/fileTypes";
import { uploadedAttachmentCacheKey, analysisReportCacheKey } from "./useIterationRecovery";
import { toUploadProgress } from "./uploadProgress";

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
  const mapping: [string, string][] = [
    ["llm_preflight_not_configured", "附件分析失败：AI 服务未配置。请联系管理员完成配置。"],
    ["llm_preflight_unreachable", "附件分析失败：AI 服务当前不可用（鉴权或网络异常）。请联系管理员检查服务连通性后重试。"],
    ["request timeout", "附件分析失败：请求超时（分析耗时过长）。请减少单次上传文件数量后重试。"],
    ["analysis job timeout", "附件分析失败：任务执行超时（异步分析未在时限内完成）。建议拆分文件夹后重试。"],
    ["analysis job failed", "附件分析失败：异步任务执行失败。请重试，若持续失败请检查后端日志。"],
    ["report_not_llm_quality", "附件分析失败：大模型输出质量不足（已禁止兜底文案）。请补充更清晰的业务文档后重试。"],
    ["analysis job stalled", "附件分析失败：任务长时间无进展，已自动终止以避免卡住。请拆分文件夹或稍后重试。"],
    ["analysis job polling failed", `附件分析失败：任务状态轮询异常，已自动停止等待。请检查后端服务后重试。详情：${raw}`],
    ["API error: 503", "附件分析失败：AI 服务未配置。请联系管理员先完成配置。"],
    ["API error: 409", "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。"],
    ["duplicate_upload", "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。"],
    ["aborted", "附件分析失败：AI 服务响应超时（后端已中断本次调用）。请重试或联系管理员调整超时配置。"],
    ["API error: 502", "附件分析失败：大模型调用异常，请稍后重试或检查模型服务可达性。"],
    ["network unavailable", "附件分析失败：后端服务不可达，请检查后端是否已启动。"]
  ];
  // Special 404 handling (must check before generic 404)
  if (raw.includes("API error: 404") && (raw.includes("job") || raw.includes("retry"))) {
    return "附件分析重试失败：未找到可重试的分析任务。请重新上传文件。";
  }
  if (raw.includes("API error: 404")) {
    return "附件分析失败：请求的资源不存在，请刷新页面后重试。";
  }
  for (const [keyword, message] of mapping) {
    if (raw.includes(keyword)) {
      return message;
    }
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
    /\.(md|txt|doc|docx|pdf|js|ts|jsx|tsx|css|scss|less|json|yaml|yml|xml|py|java|go|rs|rb|sh|sql|csv|vue|svelte|swift|kt|c|cpp|h|proto|toml|ini|env|gitignore)$/.test(name)
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

/* ── internal helper: append message ─────────────────────────────────── */

export const appendMessage = async (
  iterationId: number,
  role: ChatRole,
  content: string,
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>
) => {
  const created = await createIterationMessage(iterationId, role, content);
  setChatMessages((prev) => [...prev, created]);
};

/* ── sub-functions extracted from uploadFiles ─────────────────────────── */

type HtmlPreview = { name: string; path: string; content: string };
type ImagePreview = { name: string; path: string; dataUrl: string };

const readHtmlPreviews = async (files: File[]): Promise<HtmlPreview[]> => {
  const candidates = files.filter((item) => {
    const name = (item.name || "").toLowerCase();
    return /\.html?$/.test(name) || (/\.(md|markdown|txt|csv|json|xml|yaml|yml|toml|rst|adoc)$/i.test(name) && isDocumentAsset(item));
  }).slice(0, 3);

  const results = await Promise.all(
    candidates.map(async (item) => {
      try {
        const content = await item.text();
        if (!content.trim()) return null;
        const cappedContent = content.length > 300_000 ? content.slice(0, 300_000) : content;
        const path = (getFilePath(item) || "").trim();
        return { name: item.name, path: path || item.name, content: cappedContent };
      } catch (err) {
        console.debug("[uploadActions] 文件内容读取失败", item.name, err);
        return null;
      }
    })
  );
  return results.filter((item): item is HtmlPreview => Boolean(item));
};

const readImagePreviews = async (files: File[]): Promise<ImagePreview[]> => {
  const candidates = files
    .filter((item) => /^image\//i.test(item.type || "") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.name || ""))
    .slice(0, 6);

  const results = await Promise.all(
    candidates.map(
      (item) =>
        new Promise<ImagePreview | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : "";
            if (!dataUrl) { resolve(null); return; }
            const path = (getFilePath(item) || "").trim();
            resolve({ name: item.name, path: path || item.name, dataUrl });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(item);
        })
    )
  );
  return results.filter((item): item is ImagePreview => Boolean(item));
};

const persistUploadedFileCache = (
  iterationId: number,
  meta: UploadedAttachmentMeta,
  htmlPreviews: HtmlPreview[],
  imagePreviews: ImagePreview[]
) => {
  try {
    localStorage.setItem(
      uploadedAttachmentCacheKey(iterationId),
      JSON.stringify({
        ...meta,
        htmlPreviews: htmlPreviews.map((p) => ({ name: p.name, path: p.path, content: p.content.slice(0, 50_000) })),
        imagePreviews: imagePreviews.map((p) => ({ name: p.name, path: p.path, dataUrl: p.dataUrl.slice(0, 200_000) }))
      })
    );
  } catch { /* localStorage quota exceeded — non-critical */ }
};

const postUploadEventMessage = async (
  iterationId: number,
  files: File[],
  isBatch: boolean,
  folderName: string,
  uploadKind: string,
  hasDocumentAssets: boolean,
  hasPrototypeAssets: boolean,
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>
) => {
  const uploadLabel =
    hasDocumentAssets && !hasPrototypeAssets ? "文档"
      : hasPrototypeAssets && !hasDocumentAssets ? "原型"
        : "附件";
  const displayText = isBatch
    ? `已上传${uploadLabel}：${folderName}（${files.length} 个文件）`
    : `已上传${uploadLabel}：${files[0].name}`;

  const fileEntries = await buildFileEntries(files);
  const uploadMeta = JSON.stringify({
    kind: uploadKind,
    sourceType: isBatch ? "folder" : "single-file",
    folderName: isBatch ? folderName : undefined,
    totalFiles: files.length,
    files: fileEntries
  });
  const encodedMeta = btoa(unescape(encodeURIComponent(uploadMeta)));
  await appendMessage(iterationId, "system", `${displayText}\n<!-- upload-b64:${encodedMeta} -->`, setChatMessages);
};

const buildFileEntries = async (files: File[]) => {
  return Promise.all(files.slice(0, 30).map(async (f) => {
    const entry: {
      name: string; path: string; size: number; type: string;
      content?: string; dataUrl?: string;
    } = { name: f.name, path: getFilePath(f) || f.name, size: f.size, type: f.type || "" };
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
    } catch (err) { console.debug("[uploadActions] 文件预览读取跳过", err); }
    return entry;
  }));
};

const handlePrototypeOnlyResult = async (
  iterationId: number,
  htmlPreviews: HtmlPreview[],
  deps: UploadActionDeps
) => {
  deps.setLastUploadFailed(false);
  deps.setAnalysisReport(null);
  try { localStorage.removeItem(analysisReportCacheKey(iterationId)); } catch { /* noop */ }
  deps.setShowAnalysisPanel(false);
  deps.setUploadAnalysisProgress({
    stage: "succeeded",
    label: "原型已上传",
    detail: "仅原型素材无需调用大模型分析，可直接进入交互渲染模式。",
    percent: 100
  });
  await appendMessage(
    iterationId,
    "assistant",
    htmlPreviews.length > 0
      ? "检测到 HTML 原型附件，已进入交互渲染模式。你可以点击\u201C交互界面\u201D查看上传的页面。"
      : "检测到可交互原型附件，已进入交互渲染模式。你可以点击\u201C交互界面\u201D并选中元素后，通过 IM 描述修改指令。",
    deps.setChatMessages
  );
};

const runAnalysisAndFinish = async (
  iterationId: number,
  files: File[],
  isBatch: boolean,
  folderName: string,
  deps: UploadActionDeps
) => {
  const report = isBatch
    ? await analyzeIterationAttachmentFolder(iterationId, files, {
        folderName,
        agentScope: "full-cycle",
        forceMultiAgent: true,
        autoTransition: false,
        onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
      })
    : await analyzeIterationAttachment(iterationId, files[0], {
        agentScope: "full-cycle",
        forceMultiAgent: true,
        autoTransition: false,
        onJobUpdate: (job) => deps.setUploadAnalysisProgress(toUploadProgress(job))
      });
  deps.setAnalysisReport(report);
  try { localStorage.setItem(analysisReportCacheKey(iterationId), JSON.stringify(report)); } catch { /* quota */ }
  deps.setLastUploadFailed(false);
  deps.setShowAnalysisPanel(false);
  deps.setUploadAnalysisProgress((prev) =>
    prev?.stage === "succeeded"
      ? prev
      : { stage: "succeeded", label: "大模型分析完成", detail: "分析报告已生成，可点击\u201C查看分析报告\u201D。", percent: 100 }
  );
  await appendMessage(
    iterationId,
    "assistant",
    "文档分析完成了，请先确认分析结论是否准确，确认后我会引导你补充需要澄清的信息。",
    deps.setChatMessages
  );
  await deps.loadGovernance();
};

/* ── uploadFiles sub-steps ──────────────────────────────────────────── */

type UploadKind = "mixed" | "documents" | "prototype" | "other";

type UploadContext = {
  isBatch: boolean; folderName: string; uploadFingerprint: string;
  hasDocumentAssets: boolean; hasPrototypeAssets: boolean; uploadKind: UploadKind;
  htmlPreviews: HtmlPreview[]; imagePreviews: ImagePreview[];
};

const classifyUpload = async (files: File[]): Promise<UploadContext> => {
  const hasFolderPath = files.some((item) => Boolean((item as FileWithPath).webkitRelativePath));
  const isBatch = hasFolderPath || files.length > 1;
  const hasDocumentAssets = files.some(isDocumentAsset);
  const hasPrototypeAssets = files.some(isPrototypeAsset);
  return {
    isBatch, folderName: resolveFolderName(files), uploadFingerprint: buildUploadFingerprint(files),
    hasDocumentAssets, hasPrototypeAssets,
    uploadKind: hasDocumentAssets && hasPrototypeAssets ? "mixed" : hasDocumentAssets ? "documents" : hasPrototypeAssets ? "prototype" : "other",
    htmlPreviews: await readHtmlPreviews(files), imagePreviews: await readImagePreviews(files),
  };
};


const handleUploadError = async (iterationId: number, err: unknown, deps: UploadActionDeps) => {
  deps.setLastUploadFailed(true);
  const message = resolveUploadErrorMessage(err);
  if (message.includes("重复上传")) deps.setUploadToastMessage(message);
  deps.setError(message);
  deps.setUploadAnalysisProgress({ stage: "failed", label: "大模型分析失败", detail: message, percent: 15 });
  try { await appendMessage(iterationId, "system", message, deps.setChatMessages); }
  catch (err2) { console.warn("[Upload] failed to post secondary message", err2); }
};

/* ── uploadFiles (orchestrator) ──────────────────────────────────────── */

export const uploadFiles = async (files: File[], deps: UploadActionDeps) => {
  if (files.length === 0 || !deps.currentIteration) return;
  const iteration = deps.currentIteration;
  deps.setLastUploadFailed(false);
  deps.lastUploadAttemptRef.current = { iterationId: iteration.id, files: [...files] };

  const ctx = await classifyUpload(files);

  const latestFp = iteration.changeControl?.lastUploadedInputFingerprint?.trim() || "";
  if (latestFp && latestFp === ctx.uploadFingerprint) {
    deps.setUploadToastMessage("检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。");
    deps.setError(null); deps.setUploadAnalysisProgress(null);
    return;
  }

  const prototypeItems = files.map((f) => (getFilePath(f) || "").trim()).filter(Boolean)
    .filter((p) => /prototype|wireframe|mockup|交互|原型|界面|figma|\.fig$|\.xd$|\.sketch$|\.html?$|\.png$|\.jpg$|\.jpeg$|\.svg$/i.test(p)).slice(0, 12);
  const displayName = ctx.isBatch ? `${ctx.folderName} (${files.length} files)` : files[0].name;
  const meta: UploadedAttachmentMeta = {
    name: displayName, iterationId: iteration.id, uploadFingerprint: ctx.uploadFingerprint,
    hasDocumentAssets: ctx.hasDocumentAssets, hasPrototypeAssets: ctx.hasPrototypeAssets,
    uploadKind: ctx.uploadKind, prototypeItems, htmlPreviews: ctx.htmlPreviews, imagePreviews: ctx.imagePreviews,
  };
  deps.setUploadedFile(meta);
  persistUploadedFileCache(iteration.id, meta, ctx.htmlPreviews, ctx.imagePreviews);

  let deferredRefreshActive = true;
  try {
    await updateIterationInteractionState(iteration.id, { hasPrototypeAssets: ctx.hasPrototypeAssets, uploadKind: ctx.uploadKind, lastAttachmentName: displayName });
    const pid = deps.currentProjectId ?? iteration.projectId;
    setTimeout(() => { if (deferredRefreshActive) deps.loadIterations(pid).catch((e) => console.warn("[Upload] deferred refresh failed", e)); }, 800);
  } catch (err) { console.warn("[Upload] interaction state persistence failed", err); }

  try {
    deps.setUploadToastMessage(null); deps.setIsAnalyzingAttachment(true);
    deps.setUploadAnalysisProgress({ stage: "preparing", label: "正在准备上传内容", detail: "正在读取文件并构建分析上下文...", percent: 5 });
    try { await postUploadEventMessage(iteration.id, files, ctx.isBatch, ctx.folderName, ctx.uploadKind, ctx.hasDocumentAssets, ctx.hasPrototypeAssets, deps.setChatMessages); }
    catch (err) { console.warn("[Upload] failed to post upload event message", err); }
    if (ctx.hasPrototypeAssets && !ctx.hasDocumentAssets) { await handlePrototypeOnlyResult(iteration.id, ctx.htmlPreviews, deps); return; }
    await runAnalysisAndFinish(iteration.id, files, ctx.isBatch, ctx.folderName, deps);
  } catch (err) { await handleUploadError(iteration.id, err, deps); }
  finally { deferredRefreshActive = false; deps.setIsAnalyzingAttachment(false); }
};

/* ── handleUpload ────────────────────────────────────────────────────── */

export const handleUpload = async (event: ChangeEvent<HTMLInputElement>, deps: UploadActionDeps) => {
  const files = Array.from(event.target.files || []);
  await uploadFiles(files, deps);
  event.target.value = "";
};
