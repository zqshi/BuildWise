import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

export function registerCollabSnapshotRoutes(
  app: FastifyInstance,
  service: PlatformService,
  workspaceService: WorkspaceService,
  ensurePermission: EnsurePermission
) {
  app.get("/collab/snapshots", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (projectId === null) {
      reply.code(400);
      return { message: "请提供项目 ID" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    return service.listVersionSnapshots(projectId);
  });

  app.post("/collab/snapshots", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          iterationId: { type: "integer" },
          name: { type: "string" },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "collab:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const body = request.body as { projectId?: number; iterationId?: number; name?: string; note?: string } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const iterationId = typeof body?.iterationId === "number" ? body.iterationId : null;
    const name = body?.name?.trim();
    if (!projectId || !iterationId || !name) {
      reply.code(400);
      return { message: "请提供项目 ID、迭代 ID 和名称" };
    }
    const projectAccess = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!projectAccess) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const iterationAccess = ensureIterationAccess(workspaceService, request, reply, iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "项目或迭代不存在" : "没有权限" };
    }
    const created = service.createVersionSnapshot(projectId, iterationId, name, body?.note?.trim() || "");
    if (!created) {
      reply.code(404);
      return { message: "项目或迭代不存在" };
    }
    return created;
  });

  app.post("/collab/snapshots/:id/restore", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "collab:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const snapshotId = parsePositiveInt(params.id);
    if (snapshotId === null) {
      reply.code(400);
      return { message: "无效的快照 ID" };
    }
    const result = service.restoreVersionSnapshot(snapshotId);
    if (!result) {
      reply.code(404);
      return { message: "快照不存在" };
    }
    return result;
  });
}
