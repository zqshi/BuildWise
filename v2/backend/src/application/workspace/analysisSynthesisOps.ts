/**
 * Bridge module: re-exports from long-named workspace files
 */
export {
  buildClarificationQuestionsOp,
  mergeSynthesisResultsOp
} from "./workspaceServiceAnalysisSynthesisOps";

export {
  synthesizeFolderSelectionOp,
  synthesizeDeepInsightsOp,
  executeAgentPlanOp,
  synthesizeAttachmentInsightsOp,
  synthesizeExecutionPolicyOp
} from "./workspaceServiceAnalysisSynthesisTaskOps";
