/**
 * Bridge module: re-exports from long-named workspace files
 */
export {
  composeAttachmentExcerpt,
  resolveVisionPayloads
} from "./workspaceServiceAnalysisInputOps";

export {
  createQueuedAnalysisJobOp,
  reconcileAnalysisJobsOp,
  triggerAnalysisQueueOp,
  type AttachmentAnalysisJobRuntime
} from "./workspaceServiceAnalysisQueueOps";

export {
  runAttachmentAnalysisJobOp,
  runAttachmentAnalysisJobWithTimeoutOp
} from "./workspaceServiceAnalysisRunnerOps";

export {
  findPendingDuplicateJobOp,
  hasPendingDuplicateJobOp,
  isDuplicateAttachmentUploadOp,
  markFailedAnalysisOp,
  persistRetryableAnalysisInputOp,
  recordAttachmentInputFingerprintOp
} from "./workspaceServiceAnalysisStateOps";
