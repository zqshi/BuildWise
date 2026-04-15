import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import { hasPermission } from "../../../application/platform/platformSupport";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole } from "./workspaceRouteUtils";
import { registerCollabSnapshotRoutes } from "./platformCollabSnapshotRoutes";
import { registerCollabShareRoutes } from "./platformCollabShareRoutes";
import { registerTemplateRoutes } from "./platformTemplateRoutes";
import { registerOpsRoutes } from "./platformOpsRoutes";

export type EnsurePermission = (
  authRole: string | undefined,
  permission: string,
  workspaceService: WorkspaceService
) => { ok: true; role: string } | { ok: false; role: string };

function ensurePermission(authRole: string | undefined, permission: string, workspaceService: WorkspaceService): ReturnType<EnsurePermission> {
  const role = currentRole(authRole);
  const grantedPermissions = workspaceService.governance.resolveRolePermissions(role);
  if (!hasPermission(role, permission, grantedPermissions)) {
    return { ok: false as const, role };
  }
  return { ok: true as const, role };
}

export async function registerPlatformRoutes(app: FastifyInstance, service: PlatformService, workspaceService: WorkspaceService) {
  registerCollabSnapshotRoutes(app, service, workspaceService, ensurePermission);
  registerCollabShareRoutes(app, service, workspaceService, ensurePermission);
  registerTemplateRoutes(app, service, workspaceService, ensurePermission);
  registerOpsRoutes(app, service, workspaceService, ensurePermission);
}
