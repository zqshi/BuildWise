import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
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
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, isApiNotFound } from "./workspaceApiCore";

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

export async function coachIterationMessage(iterationId: number, message: string) {
  return fetchJSON<IterationCoachChatResponse>(`${API_BASE}/api/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  }, 180000);
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
  return fetchJSON<IterationVisualEditResponse>(`${API_BASE}/api/iterations/${iterationId}/visual-edit/execute`, {
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
    `${API_BASE}/api/iterations/${iterationId}/code-rewrite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    120000
  );
}

export async function runIterationFullCycle(iterationId: number, payload: IterationFullCycleRunInput) {
  return fetchJSON<IterationFullCycleRunResponse>(`${API_BASE}/api/iterations/${iterationId}/full-cycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 180000);
}

async function readFileExcerpt(file: File, maxLength = 4000) {
  const textLike = file.type.startsWith("text/") || /json|xml|javascript/.test(file.type);
  if (!textLike) {
    return "";
  }
  try {
    const content = await file.text();
    return content.slice(0, maxLength);
  } catch {
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

function getFilePath(file: File) {
  const maybePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
  return maybePath || file.name;
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
  } catch {
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
  return fetchJSON<AttachmentUploadInitResponse>(`${API_BASE}/api/iterations/${iterationId}/uploads/init`, {
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
  await fetchJSON<null>(`${API_BASE}/api/iterations/${iterationId}/uploads/${encodeURIComponent(uploadId)}/files/${encodeURIComponent(fileId)}/chunks/${chunkIndexOneBased}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataBase64: bytesToBase64(chunkBytes) })
  }, 45000);
}

export async function completeIterationAttachmentUpload(iterationId: number, uploadId: string) {
  return fetchJSON<AttachmentUploadCompleteResponse>(`${API_BASE}/api/iterations/${iterationId}/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST"
  }, 45000);
}

export async function submitAttachmentAnalysisJobByUpload(iterationId: number, uploadId: string, schemaVersion = "v2") {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}/api/iterations/${iterationId}/analysis/jobs/by-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, schemaVersion })
  }, 45000);
}

export async function fetchAttachmentReportIndex(iterationId: number, jobId: string) {
  return fetchJSON<AttachmentReportIndex>(
    `${API_BASE}/api/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(jobId)}/report-index`,
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
    `${API_BASE}/api/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionKey)}${query}`,
    undefined,
    45000
  );
}

async function submitAttachmentAnalysisJob(iterationId: number, payload: AttachmentUploadInput) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}/api/iterations/${iterationId}/analysis/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 45000);
}

async function retryLatestAttachmentAnalysisJob(iterationId: number) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}/api/iterations/${iterationId}/analysis/jobs/retry-latest`, {
    method: "POST"
  }, 45000);
}

async function ensureLlmReadyForAnalysis() {
  const status = await fetchJSON<LlmPreflightStatus>(`${API_BASE}/api/status`, undefined, 15000);
  const llm = status?.runtime?.llm;
  if (!llm?.configured) {
    throw new Error(`llm_preflight_not_configured:${llm?.error || "missing_configuration"}`);
  }
  if (!llm?.reachable) {
    throw new Error(`llm_preflight_unreachable:${llm?.error || "probe_failed"}`);
  }
}

async function fetchAttachmentAnalysisJob(iterationId: number, jobId: string) {
  return fetchJSON<AttachmentAnalysisJob>(
    `${API_BASE}/api/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(jobId)}`,
    undefined,
    45000
  );
}

async function waitForAttachmentAnalysisJob(
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
  const timeoutMs = options?.timeoutMs ?? 30 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const queuedStallTimeoutMs = options?.queuedStallTimeoutMs ?? 3 * 60 * 1000;
  const runningStallTimeoutMs = options?.runningStallTimeoutMs ?? 25 * 60 * 1000;
  const maxConsecutivePollErrors = 8;
  const startedAt = Date.now();
  let lastProgressMarker = "";
  let lastProgressAt = startedAt;
  let consecutivePollErrors = 0;
  while (Date.now() - startedAt < timeoutMs) {
    let job: AttachmentAnalysisJob;
    try {
      job = await fetchAttachmentAnalysisJob(iterationId, jobId);
      consecutivePollErrors = 0;
    } catch (error) {
      consecutivePollErrors += 1;
      if (consecutivePollErrors >= maxConsecutivePollErrors) {
        throw new Error(
          `analysis job polling failed: ${error instanceof Error ? error.message : "unknown_error"} (consecutive=${consecutivePollErrors})`
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }
    const marker = [
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
    if (marker !== lastProgressMarker) {
      lastProgressMarker = marker;
      lastProgressAt = Date.now();
    }
    const stallDuration = Date.now() - lastProgressAt;
    if (job.status === "queued" && stallDuration >= queuedStallTimeoutMs) {
      throw new Error(`analysis job stalled (${queuedStallTimeoutMs}ms in queued)`);
    }
    if (job.status === "running" && stallDuration >= runningStallTimeoutMs) {
      throw new Error(`analysis job stalled (${runningStallTimeoutMs}ms in running)`);
    }
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
  const textEntries = entries.filter((item) => item.excerpt.trim().length > 0);
  const folderName = options?.folderName?.trim() || "uploaded-folder";
  const digest = `strategy=folder-batch;files=${entries.length};textFiles=${textEntries.length};binaryFiles=${entries.length - textEntries.length}`;
  const preview = textEntries
    .slice(0, 3)
    .map((item) => `${item.path}: ${item.excerpt.slice(0, 200)}`)
    .join("\n\n");
  const payload: AttachmentUploadInput = {
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
  const hasFolderPath = normalized.some((item) => Boolean((item as File & { webkitRelativePath?: string }).webkitRelativePath));
  const sourceType = hasFolderPath || normalized.length > 1 ? "folder" : "single-file";
  const folderName = options?.folderName?.trim() || "uploaded-folder";
  const chunkSizeBytes = 4 * 1024 * 1024;
  const manifest = await Promise.all(normalized.map((item) => toUploadManifestFile(item, chunkSizeBytes)));
  const init = await initIterationAttachmentUpload(iterationId, {
    sourceType,
    folderName,
    idempotencyKey: `upl-${iterationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    files: manifest
  });
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
    options?.jobId && options.jobId.trim()
      ? await fetchJSON<AttachmentAnalysisJob>(
          `${API_BASE}/api/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(options.jobId)}/retry`,
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
