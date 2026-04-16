import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

export function registerCollabShareRoutes(
  app: FastifyInstance,
  service: PlatformService,
  workspaceService: WorkspaceService,
  ensurePermission: EnsurePermission
) {
  app.get("/collab/shares", {
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
    return service.listProjectShares(projectId);
  });

  app.post("/collab/shares", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          permission: { type: "string", enum: ["read", "comment"] },
          ttlHours: { type: "integer" }
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
    const body = request.body as { projectId?: number; permission?: "read" | "comment"; ttlHours?: number } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId || !body?.permission) {
      reply.code(400);
      return { message: "请提供项目 ID 和权限" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const ttlHours = typeof body.ttlHours === "number" && body.ttlHours > 0 ? Math.floor(body.ttlHours) : 72;
    const created = service.createProjectShare(projectId, body.permission, ttlHours);
    if (!created) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return created;
  });

  app.get("/collab/share/:token", {
    schema: {
      params: {
        type: "object",
        properties: { token: { type: "string", minLength: 1 } }
      }
    }
  }, async (request, reply) => {
    const params = request.params as { token: string };
    const access = service.accessShare(params.token);
    if (!access.ok) {
      reply.code(access.reason === "share_expired" ? 410 : 404);
      const msg = access.reason === "share_expired" ? "分享链接已过期" : "分享链接不存在";
      return { message: msg };
    }
    return access.data;
  });

  app.post("/collab/share/:token/comments", {
    schema: {
      params: {
        type: "object",
        properties: { token: { type: "string" } }
      },
      body: {
        type: "object",
        properties: {
          content: { type: "string", minLength: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { token: string };
    const body = request.body as { content?: string } | null;
    const content = body?.content?.trim() || "";
    if (!content) {
      reply.code(400);
      return { message: "内容不能为空" };
    }
    const result = service.commentByShare(params.token, content);
    if (!result.ok) {
      if (result.reason === "permission_denied") {
        reply.code(403);
      } else if (result.reason === "share_expired") {
        reply.code(410);
      } else {
        reply.code(404);
      }
      const reasonMap: Record<string, string> = { permission_denied: "没有评论权限", share_expired: "分享链接已过期", share_not_found: "分享链接不存在", project_not_found: "项目不存在" };
      return { message: reasonMap[result.reason] || "操作失败" };
    }
    return result.data;
  });
}
