import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  AttachmentUploadManifestFile,
  AttachmentUploadInitResponse,
  AttachmentUploadCompleteResponse,
  AttachmentReportIndex,
  AttachmentReportSectionPage,
  IterationCodeRewriteResponse,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationVisualEditResponse,
  IterationCoachChatResponse
} from "../domain/workspace/types";
import { fetchJSON, getRuntimeConfig } from "../infrastructure/http/fetchJSON";
import { waitForFullCycleJob, type FullCycleJobStatusResponse } from "./fullCycleJobPoll";
import { API_BASE, API_PREFIX, isApiNotFound } from "./workspaceApiCore";
import { type FileWithPath, getFilePath } from "../shared/fileTypes";

type LlmPreflightStatus = {
  status?: string;
  runtime?: {
    llm?: {
      configured?: boolean;
      reachable?: boolean;
      error?: string;
    };
  };
};

export type ChangeImpactResult = {
  hasImpact: boolean;
  affectedArtifacts: string[];
  affectedTerms: string[];
  affectedEntities: string[];
  affectedRules: string[];
  summary: string;
};

export async function coachIterationMessage(iterationId: number, message: string) {
  const config = getRuntimeConfig();
  return fetchJSON<IterationCoachChatResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  }, config.coachChatTimeoutMs);
}

export async function detectIterationChangeImpact(iterationId: number, userMessage: string) {
  return fetchJSON<ChangeImpactResult>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/detect-change-impact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage })
  }, 15000);
}

export async function executeIterationVisualEdit(
  iterationId: number,
  payload: {
    message: string;
    target?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }
) {
  return fetchJSON<IterationVisualEditResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/visual-edit/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function rewriteIterationCode(
  iterationId: number,
  payload: { instruction: string; dryRun?: boolean; maxFiles?: number }
) {
  return fetchJSON<IterationCodeRewriteResponse>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/code-rewrite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    120000
  );
}

export { waitForFullCycleJob, type FullCycleJobStatusResponse };

/** 触发全流程，立即返回 jobId（后端 POST /full-cycle 异步，不阻塞管道）。 */
export async function startFullCycleJob(iterationId: number, payload: IterationFullCycleRunInput): Promise<{ jobId: string }> {
  const res = await fetchJSON<{ jobId: string; status: string }>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/full-cycle`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );
  if (!res?.jobId) throw new Error("全流程启动失败：未返回任务 ID");
  return { jobId: res.jobId };
}

/** 查询全流程任务进度（轮询用）。 */
export async function fetchFullCycleJob(iterationId: number, jobId: string): Promise<FullCycleJobStatusResponse> {
  return fetchJSON<FullCycleJobStatusResponse>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/full-cycle/jobs/${encodeURIComponent(jobId)}`
  );
}

export type InterruptedFullCycleStatus = {
  interrupted: boolean;
  checkpoint: Record<string, unknown> | null;
  completedStepCount: number;
  totalStepCount: number;
  currentStep: string | null;
};

/** 查询某迭代是否有中断可续的全流程任务（刷新页面后主动感知，前端展示续跑入口）。 */
export async function fetchInterruptedFullCycle(iterationId: number): Promise<InterruptedFullCycleStatus | null> {
  return fetchJSON<InterruptedFullCycleStatus>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/full-cycle/interrupted`
  );
}

/** 请求取消运行中的全流程任务（后端在下一个步骤边界停止，checkpoint 保留可续跑）。
 *  对已终态或不存在的任务（409）返回 ok=false 而非抛错，供 UI 平静处理。 */
export async function cancelFullCycleJob(iterationId: number, jobId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    await fetchJSON<{ ok: boolean; status: string }>(
      `${API_BASE}${API_PREFIX}/iterations/${iterationId}/full-cycle/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE" }
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "取消请求失败" };
  }
}

/**
 * 触发后的轮询 wrapper：用运行时配置（getRuntimeConfig）覆盖退避/超时，
 * fetchJob 默认走 fetchFullCycleJob。纯逻辑见 fullCycleJobPoll.waitForFullCycleJob。
 */
export async function runFullCycleJob(
  iterationId: number,
  jobId: string,
  options?: {
    timeoutMs?: number;
    onProgress?: (status: FullCycleJobStatusResponse) => void;
  }
): Promise<IterationFullCycleRunResponse> {
  const config = getRuntimeConfig();
  return waitForFullCycleJob({
    fetchJob: () => fetchFullCycleJob(iterationId, jobId),
    onProgress: options?.onProgress,
    timeoutMs: options?.timeoutMs ?? 1800000,
    pollIntervalMs: config.pollIntervalMs,
    runningStallTimeoutMs: config.analysisRunningStallTimeoutMs,
    maxConsecutivePollErrors: config.pollMaxConsecutiveErrors,
    backoffDelays: [config.pollBackoffInitialMs, 2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, config.pollMaxBackoffMs]
  });
}

async function readFileExcerpt(file: File, maxLength = 4000) {
  const textLike = file.type.startsWith("text/") || /json|xml|javascript/.test(file.type);
  if (!textLike) {
    return "";
  }
  try {
    const content = await file.text();
    return content.slice(0, maxLength);
  } catch (err) {
    console.debug("[workspaceApiAgentOps] 文件文本读取失败", err);
    return "";
  }
}

async function readImageDataUrl(file: File, maxBytes = 220_000) {
  const type = (file.type || "").toLowerCase();
  if (!type.startsWith("image/")) {
    return "";
  }
  if (file.size <= 0 || file.size > maxBytes) {
    return "";
  }
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.slice(0, 300000) : "");
    reader.readAsDataURL(file);
  });
}

async function toAttachmentFileEntry(file: File, withExcerpt = true) {
  const imageDataUrl = await readImageDataUrl(file);
  return {
    path: getFilePath(file),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    excerpt: withExcerpt ? await readFileExcerpt(file, 1500) : "",
    imageDataUrl
  };
}

async function digestFileSha256(file: File) {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (err) {
    console.debug("[workspaceApiAgentOps] 文件哈希计算失败", err);
    return "";
  }
}

async function toUploadManifestFile(file: File, chunkSizeBytes: number): Promise<AttachmentUploadManifestFile> {
  const chunkCount = Math.max(1, Math.ceil(file.size / chunkSizeBytes));
  return {
    path: getFilePath(file),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    sha256: await digestFileSha256(file),
    chunkCount
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

export async function initIterationAttachmentUpload(
  iterationId: number,
  payload: {
    sourceType: "single-file" | "folder";
    folderName?: string;
    idempotencyKey: string;
    files: AttachmentUploadManifestFile[];
  }
) {
  return fetchJSON<AttachmentUploadInitResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/uploads/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 45000);
}

export async function uploadIterationAttachmentChunk(
  iterationId: number,
  uploadId: string,
  fileId: string,
  chunkIndexOneBased: number,
  chunkBytes: Uint8Array
) {
  await fetchJSON<null>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/uploads/${encodeURIComponent(uploadId)}/files/${encodeURIComponent(fileId)}/chunks/${chunkIndexOneBased}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataBase64: bytesToBase64(chunkBytes) })
  }, 45000);
}

export async function completeIterationAttachmentUpload(iterationId: number, uploadId: string) {
  return fetchJSON<AttachmentUploadCompleteResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST"
  }, 45000);
}

export async function submitAttachmentAnalysisJobByUpload(iterationId: number, uploadId: string, schemaVersion = "v2") {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs/by-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, schemaVersion })
  }, 45000);
}

export async function fetchAttachmentReportIndex(iterationId: number, jobId: string) {
  return fetchJSON<AttachmentReportIndex>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(jobId)}/report-index`,
    undefined,
    45000
  );
}

export async function fetchAttachmentReportSection(
  reportId: string,
  sectionKey: AttachmentReportIndex["sections"][number]["sectionKey"],
  cursor = 0,
  limit = 20
) {
  const query = `?cursor=${Math.max(0, Math.floor(cursor))}&limit=${Math.max(1, Math.min(200, Math.floor(limit)))}`;
  return fetchJSON<AttachmentReportSectionPage>(
    `${API_BASE}${API_PREFIX}/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionKey)}${query}`,
    undefined,
    45000
  );
}

async function submitAttachmentAnalysisJob(iterationId: number, payload: AttachmentUploadInput) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 45000);
}

export async function retryLatestAttachmentAnalysisJob(iterationId: number) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs/retry-latest`, {
    method: "POST"
  }, 45000);
}

async function ensureLlmReadyForAnalysis() {
  const status = await fetchJSON<LlmPreflightStatus>(`${API_BASE}${API_PREFIX}/status`, undefined, 15000);
  const llm = status?.runtime?.llm;
  if (!llm?.configured) {
    throw new Error(`llm_preflight_not_configured:${llm?.error || "missing_configuration"}`);
  }
  if (!llm?.reachable) {
    throw new Error(`llm_preflight_unreachable:${llm?.error || "probe_failed"}`);
  }
}

export async function fetchAttachmentAnalysisJob(iterationId: number, jobId: string) {
  return fetchJSON<AttachmentAnalysisJob>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(jobId)}`,
    undefined,
    45000
  );
}

export async function fetchLatestAnalysisReport(iterationId: number): Promise<AttachmentAnalysisReport | null> {
  try {
    return await fetchJSON<AttachmentAnalysisReport>(
      `${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/latest-report`,
      undefined,
      30000
    );
  } catch (err) {
    console.debug("[workspaceApiAgentOps] latest-report 获取失败", err);
    return null;
  }
}

function buildProgressMarker(job: AttachmentAnalysisJob): string {
  return [
    job.status,
    job.progress.completedBatches,
    job.progress.failedBatches,
    job.progress.retriedBatches,
    job.progress.processedFiles,
    job.progress.totalFiles,
    job.progress.llmCallCount || 0,
    job.progress.llmSuccessCount || 0,
    job.progress.llmFailureCount || 0,
    job.progress.llmInFlightCount || 0,
    job.progress.currentBatch || 0,
    job.progress.currentAttempt || 0,
    job.progress.stageHint || "",
    job.progress.lastLlmCallAt || ""
  ].join("|");
}

function handlePollError(
  error: unknown,
  consecutivePollErrors: number,
  maxConsecutivePollErrors: number,
  backoffDelays: number[],
  lastKnownJob: AttachmentAnalysisJob | null,
  onJobUpdate?: (job: AttachmentAnalysisJob) => void
): { backoffMs: number } {
  if (consecutivePollErrors >= maxConsecutivePollErrors) {
    throw new Error(
      `analysis job polling failed: ${error instanceof Error ? error.message : "unknown_error"} (consecutive=${consecutivePollErrors})`
    );
  }
  const backoffMs = backoffDelays[Math.min(consecutivePollErrors - 1, backoffDelays.length - 1)];
  // 通知 UI 正在重连，保持 isAnalyzingAttachment 状态
  if (lastKnownJob && onJobUpdate) {
    onJobUpdate({
      ...lastKnownJob,
      progress: { ...lastKnownJob.progress, stageHint: `poll-reconnect:attempt-${consecutivePollErrors}` }
    });
  }
  return { backoffMs };
}

function checkStallTimeout(
  job: AttachmentAnalysisJob,
  stallDuration: number,
  queuedStallTimeoutMs: number,
  runningStallTimeoutMs: number
): void {
  if (job.status === "queued" && stallDuration >= queuedStallTimeoutMs) {
    throw new Error(`analysis job stalled (${queuedStallTimeoutMs}ms in queued)`);
  }
  if (job.status === "running" && stallDuration >= runningStallTimeoutMs) {
    throw new Error(`analysis job stalled (${runningStallTimeoutMs}ms in running)`);
  }
}

export async function waitForAttachmentAnalysisJob(
  iterationId: number,
  jobId: string,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    queuedStallTimeoutMs?: number;
    runningStallTimeoutMs?: number;
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  const config = getRuntimeConfig();
  const timeoutMs = options?.timeoutMs ?? config.analysisJobTimeoutMs;
  const pollIntervalMs = options?.pollIntervalMs ?? config.pollIntervalMs;
  const queuedStallTimeoutMs = options?.queuedStallTimeoutMs ?? config.analysisQueuedStallTimeoutMs;
  const runningStallTimeoutMs = options?.runningStallTimeoutMs ?? config.analysisRunningStallTimeoutMs;
  const maxConsecutivePollErrors = config.pollMaxConsecutiveErrors;
  const POLL_BACKOFF_DELAYS = [config.pollBackoffInitialMs, 2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, config.pollMaxBackoffMs];
  const startedAt = Date.now();
  let lastProgressMarker = "";
  let lastProgressAt = startedAt;
  let consecutivePollErrors = 0;
  let lastKnownJob: AttachmentAnalysisJob | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    let job: AttachmentAnalysisJob;
    try {
      job = await fetchAttachmentAnalysisJob(iterationId, jobId);
      consecutivePollErrors = 0;
      lastKnownJob = job;
    } catch (error) {
      consecutivePollErrors += 1;
      const { backoffMs } = handlePollError(
        error, consecutivePollErrors, maxConsecutivePollErrors,
        POLL_BACKOFF_DELAYS, lastKnownJob, options?.onJobUpdate
      );
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }
    const marker = buildProgressMarker(job);
    if (marker !== lastProgressMarker) {
      lastProgressMarker = marker;
      lastProgressAt = Date.now();
    }
    checkStallTimeout(job, Date.now() - lastProgressAt, queuedStallTimeoutMs, runningStallTimeoutMs);
    options?.onJobUpdate?.(job);
    if (job.status === "succeeded" || job.status === "partial_succeeded") {
      if (!job.result) {
        throw new Error("analysis job completed without result");
      }
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "analysis job failed");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`analysis job timeout (${timeoutMs}ms)`);
}

export async function analyzeIterationAttachment(
  iterationId: number,
  file: File,
  options?: {
    agentScope?: AttachmentUploadInput["agentScope"];
    forceMultiAgent?: boolean;
    autoTransition?: boolean;
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  await ensureLlmReadyForAnalysis();
  if (file.size > 8 * 1024 * 1024) {
    return analyzeIterationAttachmentByChunkUpload(iterationId, [file], {
      folderName: file.name,
      onJobUpdate: options?.onJobUpdate
    });
  }
  const imageDataUrl = await readImageDataUrl(file);
  const payload: AttachmentUploadInput = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    sourceType: "single-file",
    excerpt: await readFileExcerpt(file),
    visionPayloads: imageDataUrl
      ? [
          {
            path: file.name,
            mimeType: file.type || "image/*",
            dataUrl: imageDataUrl
          }
        ]
      : [],
    agentScope: options?.agentScope ?? "full-cycle",
    forceMultiAgent: options?.forceMultiAgent ?? false,
    autoTransition: options?.autoTransition ?? false
  };
  try {
    const createdJob = await submitAttachmentAnalysisJob(iterationId, payload);
    options?.onJobUpdate?.(createdJob);
    return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
  } catch (error) {
    if (isApiNotFound(error)) {
      throw new Error("analysis jobs endpoint missing; backend version is not production-ready");
    }
    throw error;
  }
}

type FileEntry = Awaited<ReturnType<typeof toAttachmentFileEntry>>;

function buildFolderUploadPayload(
  entries: FileEntry[],
  folderName: string,
  options?: {
    agentScope?: AttachmentUploadInput["agentScope"];
    forceMultiAgent?: boolean;
    autoTransition?: boolean;
  }
): AttachmentUploadInput {
  const textEntries = entries.filter((item) => item.excerpt.trim().length > 0);
  const digest = `strategy=folder-batch;files=${entries.length};textFiles=${textEntries.length};binaryFiles=${entries.length - textEntries.length}`;
  const preview = textEntries
    .slice(0, 3)
    .map((item) => `${item.path}: ${item.excerpt.slice(0, 200)}`)
    .join("\n\n");
  return {
    fileName: folderName,
    mimeType: "application/x-directory",
    size: entries.reduce((total, item) => total + item.size, 0),
    sourceType: "folder",
    folderName,
    files: entries,
    visionPayloads: entries
      .filter((item) => typeof item.imageDataUrl === "string" && item.imageDataUrl.startsWith("data:image/"))
      .slice(0, 2)
      .map((item) => ({
        path: item.path,
        mimeType: item.mimeType,
        dataUrl: item.imageDataUrl || ""
      })),
    excerpt: preview.slice(0, 6000),
    excerptDigest: digest,
    excerptStrategy: "folder-batch",
    agentScope: options?.agentScope ?? "full-cycle",
    forceMultiAgent: options?.forceMultiAgent ?? true,
    autoTransition: options?.autoTransition ?? false
  };
}

export async function analyzeIterationAttachmentFolder(
  iterationId: number,
  files: File[],
  options?: {
    folderName?: string;
    agentScope?: AttachmentUploadInput["agentScope"];
    forceMultiAgent?: boolean;
    autoTransition?: boolean;
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  await ensureLlmReadyForAnalysis();
  const shouldUseChunkUpload = files.length > 40 || files.some((item) => item.size > 8 * 1024 * 1024);
  if (shouldUseChunkUpload) {
    return analyzeIterationAttachmentByChunkUpload(iterationId, files, options);
  }
  const normalized = files.filter((item) => item.size >= 0).slice(0, 1000);
  const excerptCandidates = normalized.filter((item) => {
    const fileType = (item.type || "").toLowerCase();
    const name = (item.name || "").toLowerCase();
    return (
      fileType.startsWith("text/") ||
      fileType.includes("json") ||
      fileType.includes("xml") ||
      fileType.includes("javascript") ||
      name.endsWith(".md") ||
      name.endsWith(".txt") ||
      name.endsWith(".json") ||
      name.endsWith(".ts") ||
      name.endsWith(".tsx") ||
      name.endsWith(".js") ||
      name.endsWith(".jsx")
    );
  });
  const excerptPathSet = new Set(excerptCandidates.slice(0, 160).map((item) => getFilePath(item)));
  const entries = await Promise.all(
    normalized.map((item) => toAttachmentFileEntry(item, excerptPathSet.has(getFilePath(item))))
  );
  const folderName = options?.folderName?.trim() || "uploaded-folder";
  const payload = buildFolderUploadPayload(entries, folderName, options);
  try {
    const createdJob = await submitAttachmentAnalysisJob(iterationId, payload);
    options?.onJobUpdate?.(createdJob);
    return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
  } catch (error) {
    if (isApiNotFound(error)) {
      throw new Error("analysis jobs endpoint missing; backend version is not production-ready");
    }
    throw error;
  }
}

export async function analyzeIterationAttachmentByChunkUpload(
  iterationId: number,
  files: File[],
  options?: {
    folderName?: string;
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  await ensureLlmReadyForAnalysis();
  const normalized = files.filter((item) => item.size >= 0).slice(0, 1000);
  const hasFolderPath = normalized.some((item) => Boolean((item as FileWithPath).webkitRelativePath));
  const sourceType = hasFolderPath || normalized.length > 1 ? "folder" : "single-file";
  const folderName = options?.folderName?.trim() || "uploaded-folder";
  const chunkSizeBytes = 4 * 1024 * 1024;
  const manifest = await Promise.all(normalized.map((item) => toUploadManifestFile(item, chunkSizeBytes)));
  const idempotencyKey = `upl-${iterationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const init = await initIterationAttachmentUpload(iterationId, {
    sourceType,
    folderName,
    idempotencyKey,
    files: manifest
  });
  // 持久化上传会话，用于断点续传
  try {
    localStorage.setItem(`buildwise:upload-session:${iterationId}`, JSON.stringify({
      uploadId: init.uploadId,
      idempotencyKey,
      iterationId,
      sourceType,
      folderName,
      files: manifest.map((m, idx) => ({
        fileId: init.files[idx]?.fileId || "",
        fileName: m.fileName,
        path: m.path,
        size: m.size,
        sha256: m.sha256,
        chunkCount: m.chunkCount
      })),
      createdAt: Date.now()
    }));
  } catch { /* localStorage 不可用，忽略 */ }
  for (let fileIndex = 0; fileIndex < normalized.length; fileIndex += 1) {
    const file = normalized[fileIndex];
    const fileMeta = init.files[fileIndex];
    if (!fileMeta) {
      continue;
    }
    for (let chunkIndex = 0; chunkIndex < manifest[fileIndex].chunkCount; chunkIndex += 1) {
      const start = chunkIndex * chunkSizeBytes;
      const end = Math.min(file.size, start + chunkSizeBytes);
      const buf = await file.slice(start, end).arrayBuffer();
      await uploadIterationAttachmentChunk(iterationId, init.uploadId, fileMeta.fileId, chunkIndex + 1, new Uint8Array(buf));
    }
  }
  await completeIterationAttachmentUpload(iterationId, init.uploadId);
  // 上传完成，清除断点续传会话
  try { localStorage.removeItem(`buildwise:upload-session:${iterationId}`); } catch { /* ignore */ }
  const createdJob = await submitAttachmentAnalysisJobByUpload(iterationId, init.uploadId, "v2");
  options?.onJobUpdate?.(createdJob);
  return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
}

export async function retryIterationAttachmentAnalysis(
  iterationId: number,
  options?: {
    jobId?: string;
    scope?: "job" | "batch";
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  await ensureLlmReadyForAnalysis();
  const createdJob =
    options?.jobId?.trim()
      ? await fetchJSON<AttachmentAnalysisJob>(
          `${API_BASE}${API_PREFIX}/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(options.jobId)}/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: options.scope === "batch" ? "batch" : "job" })
          },
          45000
        )
      : await retryLatestAttachmentAnalysisJob(iterationId);
  options?.onJobUpdate?.(createdJob);
  return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
}

/* ── 上传断点续传 ── */

export type UploadSession = {
  uploadId: string;
  idempotencyKey: string;
  iterationId: number;
  sourceType: "single-file" | "folder";
  folderName: string;
  files: Array<{ fileId: string; fileName: string; path: string; size: number; sha256: string; chunkCount: number }>;
  createdAt: number;
};

export type UploadStatusResponse = {
  uploadId: string;
  status: string;
  files: Array<{ fileId: string; fileName: string; path: string; chunkCount: number; missingChunkIndexes: number[] }>;
};

export function getUploadSession(iterationId: number): UploadSession | null {
  try {
    const raw = localStorage.getItem(`buildwise:upload-session:${iterationId}`);
    if (!raw) return null;
    const session = JSON.parse(raw) as UploadSession;
    // 会话超过配置的时间（默认 2 小时）视为过期
    const config = getRuntimeConfig();
    const sessionMaxAge = config.sessionMaxAgeSeconds * 1000;
    if (Date.now() - session.createdAt > sessionMaxAge) {
      localStorage.removeItem(`buildwise:upload-session:${iterationId}`);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearUploadSession(iterationId: number) {
  try { localStorage.removeItem(`buildwise:upload-session:${iterationId}`); } catch { /* ignore */ }
}

export async function fetchUploadStatus(iterationId: number, uploadId: string): Promise<UploadStatusResponse> {
  return fetchJSON<UploadStatusResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/uploads/${encodeURIComponent(uploadId)}/status`, undefined, 15000);
}

export async function resumeIterationAttachmentUpload(
  iterationId: number,
  session: UploadSession,
  files: File[],
  options?: {
    onJobUpdate?: (job: AttachmentAnalysisJob) => void;
  }
) {
  await ensureLlmReadyForAnalysis();
  const chunkSizeBytes = 4 * 1024 * 1024;

  // 查询后端当前状态，仅上传缺失块
  const status = await fetchUploadStatus(iterationId, session.uploadId);

  if (status.status === "uploaded") {
    // 上传已完成但分析未开始，直接提交分析
    const createdJob = await submitAttachmentAnalysisJobByUpload(iterationId, session.uploadId, "v2");
    options?.onJobUpdate?.(createdJob);
    clearUploadSession(iterationId);
    return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
  }

  if (status.status === "failed") {
    clearUploadSession(iterationId);
    throw new Error("上传已失败，请重新上传。");
  }

  // 仅上传缺失的块
  for (const fileStatus of status.files) {
    if (fileStatus.missingChunkIndexes.length === 0) continue;
    const fileIdx = files.findIndex((f) => f.name === fileStatus.fileName);
    if (fileIdx < 0) continue;
    const file = files[fileIdx];
    for (const chunkIdx of fileStatus.missingChunkIndexes) {
      const start = chunkIdx * chunkSizeBytes;
      const end = Math.min(file.size, start + chunkSizeBytes);
      const buf = await file.slice(start, end).arrayBuffer();
      await uploadIterationAttachmentChunk(iterationId, session.uploadId, fileStatus.fileId, chunkIdx + 1, new Uint8Array(buf));
    }
  }

  await completeIterationAttachmentUpload(iterationId, session.uploadId);
  clearUploadSession(iterationId);
  const createdJob = await submitAttachmentAnalysisJobByUpload(iterationId, session.uploadId, "v2");
  options?.onJobUpdate?.(createdJob);
  return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId, { onJobUpdate: options?.onJobUpdate });
}
