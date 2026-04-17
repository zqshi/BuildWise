/**
 * uploadActions — barrel re-export for backwards compatibility.
 *
 * Actual implementations live in:
 *   uploadCore.ts     — types, pure helpers, main uploadFiles logic
 *   uploadProgress.ts — progress tracking (toUploadProgress)
 *   uploadRetry.ts    — retry and resume handlers
 */

export {
  buildAutoFullCycleAnalysisInput,
  resolveUploadErrorMessage,
  handleUploadClick,
  resolveFolderName,
  hashFingerprint,
  buildUploadFingerprint,
  isDocumentAsset,
  isPrototypeAsset,
  uploadFiles,
  handleUpload,
  type UploadActionDeps
} from "./uploadCore";

export { toUploadProgress } from "./uploadProgress";

export { handleRetryUpload, handleResumeUpload } from "./uploadRetry";
