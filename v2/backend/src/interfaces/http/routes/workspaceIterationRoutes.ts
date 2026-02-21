import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { registerWorkspaceIterationChangeControlRoutes } from "./workspaceIterationChangeControlRoutes";
import { registerWorkspaceIterationCoreRoutes } from "./workspaceIterationCoreRoutes";

export function registerWorkspaceIterationRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceIterationCoreRoutes(app, service);
  registerWorkspaceIterationChangeControlRoutes(app, service);
}
