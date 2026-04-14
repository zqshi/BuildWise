import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspaceIterationChangeControlArtifactRoutes } from "./workspaceIterationChangeControlArtifactRoutes";
import { registerWorkspaceIterationChangeControlCoreRoutes } from "./workspaceIterationChangeControlCoreRoutes";
import { registerWorkspaceIterationChangeControlQualityRoutes } from "./workspaceIterationChangeControlQualityRoutes";

export function registerWorkspaceIterationChangeControlRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceIterationChangeControlCoreRoutes(app, service);
  registerWorkspaceIterationChangeControlArtifactRoutes(app, service);
  registerWorkspaceIterationChangeControlQualityRoutes(app, service);
}
