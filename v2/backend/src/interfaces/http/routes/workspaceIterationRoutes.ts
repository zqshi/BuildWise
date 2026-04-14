import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspaceIterationChangeControlRoutes } from "./workspaceIterationChangeControlRoutes";
import { registerWorkspaceIterationCoreRoutes } from "./workspaceIterationCoreRoutes";
import { registerWorkspaceIterationUploadRoutes } from "./workspaceIterationUploadRoutes";
import { registerWorkspaceIterationAnalysisJobRoutes } from "./workspaceIterationAnalysisJobRoutes";
import { registerWorkspaceIterationStateRoutes } from "./workspaceIterationStateRoutes";

export function registerWorkspaceIterationRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceIterationCoreRoutes(app, service);
  registerWorkspaceIterationUploadRoutes(app, service);
  registerWorkspaceIterationAnalysisJobRoutes(app, service);
  registerWorkspaceIterationStateRoutes(app, service);
  registerWorkspaceIterationChangeControlRoutes(app, service);
}
