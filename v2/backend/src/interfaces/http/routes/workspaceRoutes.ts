import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspaceIterationRoutes } from "./workspaceIterationRoutes";
import { registerWorkspacePolicyRoutes } from "./workspacePolicyRoutes";
import { registerWorkspaceProjectRoutes } from "./workspaceProjectRoutes";

export async function registerWorkspaceRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceProjectRoutes(app, service);
  registerWorkspacePolicyRoutes(app, service);
  registerWorkspaceIterationRoutes(app, service);
}
