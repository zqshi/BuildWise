/**
 * Bridge module: re-exports from long-named workspace files
 */
export {
  listAuditLogsOp,
  listGovernancePermissionPointsOp,
  listGovernanceRolesOp
} from "./workspaceServiceGovernanceOps";

export { executeVisualEditInstructionOp } from "./workspaceServiceVisualEditOps";
export { rewriteCodeInBoundaryOp } from "./workspaceServiceCodeRewriteOps";
export { generateUxExecutionGuidanceOp } from "./workspaceServiceUxGuidanceOps";
