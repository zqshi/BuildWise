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
    return initAttachmentUploadOp(this.uploadOpsContext, iterationId, input);
  }

  getAttachmentUpload(iterationId: number, uploadId: string): AttachmentUploadRecord | null {
    return getAttachmentUploadOp(this.uploadOpsContext, iterationId, uploadId);
  }

  putAttachmentUploadChunk(iterationId: number, uploadId: string, fileId: string, chunkIndex: number, chunk: Uint8Array): boolean {
    return putAttachmentUploadChunkOp(this.uploadOpsContext, iterationId, uploadId, fileId, chunkIndex, chunk);
  }

  completeAttachmentUpload(iterationId: number, uploadId: string): { upload: AttachmentUploadRecord; ingestJob: AttachmentIngestJob } | null {
    return completeAttachmentUploadOp(this.uploadOpsContext, iterationId, uploadId);
  }

  submitAttachmentAnalysisJobFromUpload(iterationId: number, uploadId: string, schemaVersion = "v2"): AttachmentAnalysisJob | null {
    return submitAttachmentAnalysisJobFromUploadOp(this.uploadOpsContext, iterationId, uploadId, schemaVersion);
  }
}
