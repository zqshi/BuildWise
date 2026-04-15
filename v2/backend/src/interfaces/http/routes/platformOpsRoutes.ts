import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import type { EnsurePermission } from "./platformRoutes";
import { registerOpsDeploymentRoutes } from "./platformOpsDeploymentRoutes";
import { registerOpsTriageRoutes } from "./platformOpsTriageRoutes";

export function registerOpsRoutes(
  app: FastifyInstance,
  service: PlatformService,
  workspaceService: WorkspaceService,
  ensurePermission: EnsurePermission
) {
  registerOpsDeploymentRoutes(app, service, workspaceService, ensurePermission);
  registerOpsTriageRoutes(app, service, workspaceService, ensurePermission);
}
