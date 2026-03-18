import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import type {
  AttachmentUploadInput,
  IterationCodeRewriteResponse
} from "../../domain/workspace/types";
export { nowIso, pickStringList } from "../../shared/utils";
import { mergeAttachmentReports } from "./workspaceServiceAttachmentReportMerge";

function countInputFiles(input: AttachmentUploadInput) {
  if (input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0) {
    return input.files.length;
  }
  return 1;
}

export function summarizeInput(input: AttachmentUploadInput) {
  const totalFiles = countInputFiles(input);
  const totalBytes =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? input.files.reduce((total, item) => total + (Number.isFinite(item.size) ? item.size : 0), 0)
      : Number.isFinite(input.size)
        ? input.size
        : 0;
  return {
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    folderName: input.folderName?.trim() || "",
    totalFiles,
    totalBytes
  } as const;
}

function hashFingerprint(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildAttachmentInputFingerprint(input: AttachmentUploadInput) {
  const sourceType = input.sourceType === "folder" ? "folder" : "single-file";
  const fileName = (input.fileName || "").trim();
  const folderName = (input.folderName || "").trim();
  const size = Number.isFinite(input.size) ? Number(input.size) : 0;
  const mimeType = (input.mimeType || "").trim().toLowerCase();
  const digest = (input.excerptDigest || "").trim();
  const excerptHead = (input.excerpt || "").trim().slice(0, 400);
  const files =
    sourceType === "folder" && Array.isArray(input.files)
      ? input.files
          .map((item) => ({
            path: (item.path || item.fileName || "").trim(),
            fileName: (item.fileName || "").trim(),
            size: Number.isFinite(item.size) ? Number(item.size) : 0,
            mimeType: (item.mimeType || "").trim().toLowerCase()
          }))
          .filter((item) => item.path || item.fileName)
          .sort((a, b) => `${a.path}|${a.fileName}`.localeCompare(`${b.path}|${b.fileName}`))
      : [];
  const raw = JSON.stringify({
    sourceType,
    fileName,
    folderName,
    size,
    mimeType,
    digest,
    excerptHead,
    files
  });
  return `afp-${hashFingerprint(raw)}`;
}

export function parseAttachmentInputSnapshot(raw: string): AttachmentUploadInput | null {
  const text = (raw || "").trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as AttachmentUploadInput;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.fileName !== "string" || !parsed.fileName.trim()) {
      return null;
    }
    if (parsed.sourceType !== "single-file" && parsed.sourceType !== "folder") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function shortId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function sha256Hex(buffer: Uint8Array | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function splitAttachmentInputIntoBatches(input: AttachmentUploadInput, maxBatchFiles: number) {
  if (input.sourceType !== "folder" || !Array.isArray(input.files) || input.files.length <= maxBatchFiles) {
    return [input];
  }
  const files = input.files;
  const batches: AttachmentUploadInput[] = [];
  const totalBatches = Math.ceil(files.length / maxBatchFiles);
  for (let index = 0; index < totalBatches; index += 1) {
    const batchFiles = files.slice(index * maxBatchFiles, (index + 1) * maxBatchFiles);
    const digestBase = (input.excerptDigest || "").trim();
    const digest = digestBase
      ? `${digestBase};batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`
      : `strategy=folder-batch;batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`;
    const batchPreview = batchFiles
      .filter((item) => item.excerpt.trim().length > 0)
      .slice(0, 3)
      .map((item) => `${item.path || item.fileName}: ${item.excerpt.slice(0, 180)}`)
      .join("\n\n");
    batches.push({
      ...input,
      excerpt: (batchPreview || input.excerpt || "").slice(0, 6000),
      excerptDigest: digest,
      excerptStrategy: "folder-batch",
      files: batchFiles
    });
  }
  return batches;
}

function createEmptyRewriteResponse(iterationId: number, dryRun: boolean, summary: string): IterationCodeRewriteResponse {
  return {
    iterationId,
    dryRun,
    summary,
    warnings: [],
    appliedFiles: [],
    skippedFiles: [],
    outOfBoundaryFiles: [],
    edits: []
  };
}

export function mergeRewriteResults(
  iterationId: number,
  dryRun: boolean,
  runs: Array<{ label: string; result: IterationCodeRewriteResponse | null }>
): IterationCodeRewriteResponse {
  const validRuns = runs
    .filter((item) => Boolean(item.result))
    .map((item) => ({ label: item.label, result: item.result as IterationCodeRewriteResponse }));
  if (validRuns.length === 0) {
    return createEmptyRewriteResponse(iterationId, dryRun, "未执行改写：未获得有效改写结果。");
  }
  const summary = validRuns.map((item) => `${item.label}:${item.result.summary}`).join(" | ");
  return {
    iterationId,
    dryRun,
    summary,
    warnings: Array.from(new Set(validRuns.flatMap((item) => item.result.warnings))),
    appliedFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.appliedFiles))),
    skippedFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.skippedFiles))),
    outOfBoundaryFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.outOfBoundaryFiles))),
    edits: validRuns.flatMap((item) => item.result.edits)
  };
}

export function safeJsonParse(value: string) {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export { mergeAttachmentReports };
