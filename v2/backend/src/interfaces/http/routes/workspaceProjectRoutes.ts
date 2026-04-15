import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspaceProjectGovernanceRoutes } from "./workspaceProjectGovernanceRoutes";
import { registerWorkspaceProjectCoreRoutes } from "./workspaceProjectCoreRoutes";

export function registerWorkspaceProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceProjectGovernanceRoutes(app, service);
  registerWorkspaceProjectCoreRoutes(app, service);
}
