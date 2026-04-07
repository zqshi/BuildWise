import { join } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentAnalysisJob,
  AttachmentUploadInput,
  AttachmentUploadRecord,
  AttachmentIngestJob
} from "../../domain/workspace/types";
import type { AnalysisService } from "./analysisService";
import { ensureDir } from "./attachmentOps";
import {
  completeAttachmentUploadOp,
  getAttachmentUploadOp,
  initAttachmentUploadOp,
  putAttachmentUploadChunkOp,
  submitAttachmentAnalysisJobFromUploadOp,
  type UploadInitInput
} from "./workspaceServiceAttachmentUploadOps";

export class UploadService {
  readonly uploads = new Map<string, AttachmentUploadRecord>();

  readonly ingestJobs = new Map<string, AttachmentIngestJob>();

  private readonly attachmentChunkStorageDir: string;

  constructor(
    private readonly repo: WorkspaceRepository,
    readonly analysisService: AnalysisService,
    _agentRunner: unknown = null
  ) {
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    this.attachmentChunkStorageDir = (processEnv.ATTACHMENT_CHUNK_STORAGE_DIR || join(process.cwd(), ".runtime", "attachment-chunks")).trim();
    ensureDir(this.attachmentChunkStorageDir);
    this.restoreFromDb();
  }

  private restoreFromDb() {
    try {
      for (const project of this.repo.listProjects()) {
        for (const iter of this.repo.listIterations(project.id)) {
          for (const upload of (this.repo.listUploads?.(iter.id) ?? [])) {
            if (!this.uploads.has(upload.uploadId)) {
              this.uploads.set(upload.uploadId, upload);
            }
          }
        }
      }
    } catch (err) {
      console.error("[UploadService] Failed to restore uploads from DB", err);
    }
  }

  private persistUpload(upload: AttachmentUploadRecord) {
    try { this.repo.saveUpload?.(upload); } catch (err) {
      console.error("[UploadService] Failed to persist upload", upload.uploadId, err);
    }
  }

  private persistIngestJob(job: AttachmentIngestJob) {
    try { this.repo.saveIngestJob?.(job); } catch (err) {
      console.error("[UploadService] Failed to persist ingest job", job.ingestJobId, err);
    }
  }

  private get uploadOpsContext() {
    return {
      repo: this.repo,
      uploads: this.uploads,
      ingestJobs: this.ingestJobs,
      reportIndexesByJobId: this.analysisService.reportIndexes,
      attachmentChunkStorageDir: this.attachmentChunkStorageDir,
      submitAttachmentAnalysisJob: (targetIterationId: number, analysisInput: AttachmentUploadInput) =>
        this.analysisService.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
    };
  }

  initAttachmentUpload(iterationId: number, input: UploadInitInput): AttachmentUploadRecord | null {
    const result = initAttachmentUploadOp(this.uploadOpsContext, iterationId, input);
    if (result) this.persistUpload(result);
    return result;
  }

  getAttachmentUpload(iterationId: number, uploadId: string): AttachmentUploadRecord | null {
    return getAttachmentUploadOp(this.uploadOpsContext, iterationId, uploadId);
  }

  putAttachmentUploadChunk(iterationId: number, uploadId: string, fileId: string, chunkIndex: number, chunk: Uint8Array): boolean {
    const ok = putAttachmentUploadChunkOp(this.uploadOpsContext, iterationId, uploadId, fileId, chunkIndex, chunk);
    if (ok) {
      const upload = this.uploads.get(uploadId);
      if (upload) this.persistUpload(upload);
    }
    return ok;
  }

  completeAttachmentUpload(iterationId: number, uploadId: string): { upload: AttachmentUploadRecord; ingestJob: AttachmentIngestJob } | null {
    const result = completeAttachmentUploadOp(this.uploadOpsContext, iterationId, uploadId);
    if (result) {
      this.persistUpload(result.upload);
      this.persistIngestJob(result.ingestJob);
    }
    return result;
  }

  submitAttachmentAnalysisJobFromUpload(iterationId: number, uploadId: string, schemaVersion = "v2"): AttachmentAnalysisJob | null {
    return submitAttachmentAnalysisJobFromUploadOp(this.uploadOpsContext, iterationId, uploadId, schemaVersion);
  }
}
