import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerWorkspaceIterationRoutes } from "./workspaceIterationRoutes";
import { registerWorkspacePolicyRoutes } from "./workspacePolicyRoutes";
import { registerWorkspaceProjectRoutes } from "./workspaceProjectRoutes";
import { registerWorkspaceBacklogRoutes } from "./workspaceBacklogRoutes";
import { registerWorkspaceKnowledgeRoutes } from "./workspaceKnowledgeRoutes";

export async function registerWorkspaceRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerWorkspaceProjectRoutes(app, service);
  registerWorkspacePolicyRoutes(app, service);
  registerWorkspaceIterationRoutes(app, service);
  registerWorkspaceBacklogRoutes(app, service);
  registerWorkspaceKnowledgeRoutes(app, service);
}
