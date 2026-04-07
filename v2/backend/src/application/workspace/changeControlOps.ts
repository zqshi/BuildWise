/**
 * Bridge module: re-exports from long-named workspace files
 */
export {
  confirmIterationAnalysisOp,
  updateClarificationDraftOp,
  updateIterationBoundaryOp,
  updateIterationTestMatrixExecutionOp,
  getIterationChangeControlOp
} from "./workspaceServiceChangeControlCoreOps";

export {
  confirmIterationArtifactOp,
  commitIterationArtifactOp,
  appendIterationArtifactToConversationOp,
  getIterationArtifactWorkflowOp,
  saveIterationArtifactDraftOp,
  transitionIterationArtifactStageOp
} from "./workspaceServiceChangeControlArtifactOps";

export { ensureArtifactWorkflow } from "./workspaceServiceChangeControlArtifactWorkflow";
