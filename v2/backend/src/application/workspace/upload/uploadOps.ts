import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentAnalysisJob,
  AttachmentReportIndex,
  AttachmentUploadFileRecord,
  AttachmentUploadInput,
  AttachmentUploadManifestFile,
  AttachmentUploadRecord,
  AttachmentIngestJob
} from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';
import { ensureDir, nowIso, sha256Hex, shortId } from './attachmentUtils';

export type UploadInitInput = {
  sourceType: "single-file" | "folder";
  folderName?: string;
  idempotencyKey: string;
  files: AttachmentUploadManifestFile[];
};

type AttachmentUploadOpsContext = {
  repo: WorkspaceRepository;
  uploads: Map<string, AttachmentUploadRecord>;
  ingestJobs: Map<string, AttachmentIngestJob>;
  reportIndexesByJobId: ReadonlyMap<string, AttachmentReportIndex>;
  attachmentChunkStorageDir: string;
  submitAttachmentAnalysisJob: (iterationId: number, input: AttachmentUploadInput) => AttachmentAnalysisJob | null;
};

export function initAttachmentUploadOp(ctx: AttachmentUploadOpsContext, iterationId: number, input: UploadInitInput): AttachmentUploadRecord | null {
  const iteration = ctx.repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const sourceType = input.sourceType === "folder" ? "folder" : "single-file";
  const idempotencyKey = (input.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    return null;
  }
  const existing = Array.from(ctx.uploads.values()).find((item) => item.iterationId === iterationId && item.idempotencyKey === idempotencyKey);
  if (existing) {
    return existing;
  }
  const now = nowIso();
  const uploadId = shortId("upl");
  const files = input.files.map((item, idx) => {
    const fileId = shortId(`f${idx}`);
    return {
      fileId,
      uploadId,
      path: item.path,
      fileName: item.fileName,
      mimeType: item.mimeType,
      size: item.size,
      sha256: item.sha256,
      chunkCount: Math.max(1, item.chunkCount),
      uploadedChunks: 0,
      status: "uploading",
      chunkBitmap: new Array(Math.max(1, item.chunkCount)).fill(false),
      chunks: [],
      createdAt: now,
      updatedAt: now,
      errorCode: "",
      errorMessage: ""
    } satisfies AttachmentUploadFileRecord;
  });
  const upload: AttachmentUploadRecord = {
    uploadId,
    iterationId,
    sourceType,
    folderName: (input.folderName || "").trim(),
    idempotencyKey,
    status: "uploading",
    totalFiles: files.length,
    totalBytes: files.reduce((sum, item) => sum + item.size, 0),
    files,
    createdAt: now,
    updatedAt: now,
    errorCode: "",
    errorMessage: ""
  };
  ctx.uploads.set(uploadId, upload);
  iteration.changeControl = {
    ...(iteration.changeControl || defaultIterationChangeControl()),
    lastAttachmentUploadId: uploadId
  };
  ctx.repo.updateIteration(iteration);
  return upload;
}

export function getAttachmentUploadOp(ctx: AttachmentUploadOpsContext, iterationId: number, uploadId: string): AttachmentUploadRecord | null {
  const upload = ctx.uploads.get(uploadId);
  if (!upload || upload.iterationId !== iterationId) {
    return null;
  }
  return upload;
}

export function putAttachmentUploadChunkOp(
  ctx: AttachmentUploadOpsContext,
  iterationId: number,
  uploadId: string,
  fileId: string,
  chunkIndex: number,
  chunk: Uint8Array
): boolean {
  const upload = ctx.uploads.get(uploadId);
  if (!upload || upload.iterationId !== iterationId) {
    return false;
  }
  const file = upload.files.find((item) => item.fileId === fileId);
  if (!file) {
    return false;
  }
  if (chunkIndex < 0 || chunkIndex >= file.chunkCount) {
    return false;
  }
  const now = nowIso();
  const dir = join(ctx.attachmentChunkStorageDir, uploadId, fileId);
  ensureDir(dir);
  const path = join(dir, `${chunkIndex}.bin`);
  writeFileSync(path, chunk);
  const chunkHash = sha256Hex(chunk);
  const existingMetaIndex = file.chunks.findIndex((item) => item.chunkIndex === chunkIndex);
  const meta = {
    chunkIndex,
    chunkSize: chunk.length,
    chunkSha256: chunkHash,
    storagePath: path,
    receivedAt: now
  };
  if (existingMetaIndex >= 0) {
    file.chunks[existingMetaIndex] = meta;
  } else {
    file.chunks.push(meta);
  }
  if (!file.chunkBitmap[chunkIndex]) {
    file.chunkBitmap[chunkIndex] = true;
    file.uploadedChunks += 1;
  }
  file.updatedAt = now;
  if (file.uploadedChunks >= file.chunkCount) {
    file.status = "uploaded";
  }
  upload.updatedAt = now;
  if (upload.files.every((item) => item.status === "uploaded")) {
    upload.status = "uploaded";
  }
  return true;
}

export function completeAttachmentUploadOp(
  ctx: AttachmentUploadOpsContext,
  iterationId: number,
  uploadId: string
): { upload: AttachmentUploadRecord; ingestJob: AttachmentIngestJob } | null {
  const upload = ctx.uploads.get(uploadId);
  if (!upload || upload.iterationId !== iterationId) {
    return null;
  }
  const now = nowIso();
  const allUploaded = upload.files.every((item) => item.uploadedChunks >= item.chunkCount);
  if (!allUploaded) {
    upload.status = "failed";
    upload.updatedAt = now;
    upload.errorCode = "UPLOAD_INCOMPLETE";
    upload.errorMessage = "some file chunks are missing";
    return null;
  }
  upload.status = "uploaded";
  upload.updatedAt = now;
  const ingestJob: AttachmentIngestJob = {
    ingestJobId: shortId("ing"),
    uploadId,
    status: "completed",
    totalFiles: upload.totalFiles,
    processedFiles: upload.totalFiles,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    heartbeatAt: now,
    errorCode: "",
    errorMessage: ""
  };
  ctx.ingestJobs.set(ingestJob.ingestJobId, ingestJob);
  const iteration = ctx.repo.findIteration(iterationId);
  if (iteration) {
    iteration.changeControl = {
      ...(iteration.changeControl || defaultIterationChangeControl()),
      lastAttachmentUploadId: uploadId,
      lastAttachmentIngestJobId: ingestJob.ingestJobId
    };
    ctx.repo.updateIteration(iteration);
  }
  return { upload, ingestJob };
}

/**
 * 从磁盘 chunk 文件中重组上传文件的原始内容。
 * chunk 按索引顺序存储在 attachmentChunkStorageDir/uploadId/fileId/chunkIndex.bin
 */
function reassembleUploadedFileContent(
  chunkStorageDir: string,
  uploadId: string,
  fileId: string,
  chunkCount: number
): Buffer {
  const dir = join(chunkStorageDir, uploadId, fileId);
  const buffers: Buffer[] = [];
  for (let idx = 0; idx < chunkCount; idx += 1) {
    const path = join(dir, `${idx}.bin`);
    if (existsSync(path)) {
      buffers.push(readFileSync(path));
    }
  }
  return Buffer.concat(buffers);
}

/** 判断文件名是否为可提取文本的格式 */
function isTextLikeFile(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase();
  if (/\.(md|markdown|txt|csv|json|xml|yaml|yml|toml|ini|cfg|conf|log|sql|sh|bash|zsh|py|js|ts|tsx|jsx|html|htm|css|scss|less|vue|svelte|rb|go|rs|java|kt|c|cpp|h|hpp|cs|php|pl|ps1|bat|env|gitignore|editorconfig|eslintrc|prettierrc|dockerfile|makefile|cmakelists|gradle|properties|adoc|rst|tex|org)$/i.test(name)) {
    return true;
  }
  return mimeType.startsWith("text/") || /json|xml|javascript|markdown/.test(mimeType);
}

/** 从文件 Buffer 中安全提取文本 excerpt */
function extractTextExcerpt(content: Buffer, maxLength = 12000): string {
  // 尝试 UTF-8 解码，如果失败则标记为二进制
  const text = content.toString("utf-8");
  // 检查是否包含过多的替换字符（无效 UTF-8 的标志）
  const replacementCount = (text.match(/\ufffd/g) || []).length;
  if (replacementCount > text.length * 0.1) {
    return "";
  }
  return text.slice(0, maxLength).trim();
}

export function submitAttachmentAnalysisJobFromUploadOp(
  ctx: AttachmentUploadOpsContext,
  iterationId: number,
  uploadId: string,
  schemaVersion: string
): AttachmentAnalysisJob | null {
  const upload = ctx.uploads.get(uploadId);
  if (!upload || upload.iterationId !== iterationId || upload.status !== "uploaded") {
    return null;
  }
  // 从 chunk 中提取每个文件的文本 excerpt
  const fileExcerpts = new Map<string, string>();
  for (const file of upload.files) {
    if (isTextLikeFile(file.fileName, file.mimeType)) {
      const raw = reassembleUploadedFileContent(ctx.attachmentChunkStorageDir, uploadId, file.fileId, file.chunkCount);
      fileExcerpts.set(file.fileId, extractTextExcerpt(raw));
    }
  }
  const input: AttachmentUploadInput = upload.sourceType === "folder"
    ? {
        fileName: upload.folderName || "uploaded-folder",
        mimeType: "application/octet-stream",
        size: upload.totalBytes,
        excerpt: "",
        sourceType: "folder",
        folderName: upload.folderName || "uploaded-folder",
        files: upload.files.map((item) => ({
          path: item.path,
          fileName: item.fileName,
          mimeType: item.mimeType,
          size: item.size,
          excerpt: fileExcerpts.get(item.fileId) || "",
          imageDataUrl: ""
        })),
        excerptStrategy: "folder-batch"
      }
    : {
        fileName: upload.files[0]?.fileName || "uploaded-file",
        mimeType: upload.files[0]?.mimeType || "application/octet-stream",
        size: upload.files[0]?.size || 0,
        excerpt: fileExcerpts.get(upload.files[0]?.fileId || "") || "",
        sourceType: "single-file"
      };
  const job = ctx.submitAttachmentAnalysisJob(iterationId, input);
  if (job) {
    const report = ctx.reportIndexesByJobId.get(job.jobId);
    if (report) {
      report.schemaVersion = schemaVersion;
    }
  }
  return job;
}
