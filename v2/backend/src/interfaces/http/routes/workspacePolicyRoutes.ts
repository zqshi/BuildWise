import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspacePolicyGlobalRoutes } from "./workspacePolicyGlobalRoutes";
import { registerWorkspacePolicyProjectRoutes } from "./workspacePolicyProjectRoutes";
import { registerWorkspacePolicyExecutionRoutes } from "./workspacePolicyExecutionRoutes";

export function registerWorkspacePolicyRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspacePolicyGlobalRoutes(app, service);
  registerWorkspacePolicyProjectRoutes(app, service);
  registerWorkspacePolicyExecutionRoutes(app, service);
}
