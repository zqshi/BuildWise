import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { registerWorkspaceIterationRoutes } from "./workspaceIterationRoutes";
import { registerWorkspaceProjectRoutes } from "./workspaceProjectRoutes";

export async function registerWorkspaceRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceProjectRoutes(app, service);
  registerWorkspaceIterationRoutes(app, service);
}
