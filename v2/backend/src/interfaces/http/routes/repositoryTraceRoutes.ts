import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { registerRepositoryConfigRoutes } from "./repositoryConfigRoutes";
import { registerRepositoryProvisionRoutes } from "./repositoryProvisionRoutes";
import { registerRepositoryPublishRoutes } from "./repositoryPublishRoutes";

export async function registerRepositoryTraceRoutes(app: FastifyInstance, service: WorkspaceService) {
  registerRepositoryConfigRoutes(app, service);
  registerRepositoryProvisionRoutes(app, service);
  registerRepositoryPublishRoutes(app, service);
}
