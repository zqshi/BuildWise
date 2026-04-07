/**
 * Bridge module: re-exports from long-named workspace files
 */
export {
  safeJsonParse,
  ensureDir,
  nowIso,
  sha256Hex,
  shortId,
  mergeRewriteResults,
  parseAttachmentInputSnapshot,
  summarizeInput,
  buildAttachmentInputFingerprint
} from "./workspaceServiceAttachmentUtils";

export {
  buildAttachmentReportSections,
  getAttachmentReportSectionPage
} from "./workspaceServiceAttachmentReportOps";
