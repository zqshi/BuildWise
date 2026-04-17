import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

async function handleListShares(service: PlatformService, ws: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.query as { projectId?: string } | null)?.projectId);
  if (projectId === null) { reply.code(400); return { message: "请提供项目 ID" }; }
  const access = ensureProjectAccess(ws, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  return service.listProjectShares(projectId);
}

async function handleCreateShare(
  service: PlatformService, ws: WorkspaceService, request: FastifyRequest, reply: FastifyReply, ensurePermission: EnsurePermission
) {
  const permit = ensurePermission(request.authRole, "collab:write", ws);
  if (!permit.ok) { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as { projectId?: number; permission?: "read" | "comment"; ttlHours?: number } | null;
  const projectId = typeof body?.projectId === "number" ? body.projectId : null;
  if (!projectId || !body?.permission) { reply.code(400); return { message: "请提供项目 ID 和权限" }; }
  const access = ensureProjectAccess(ws, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const ttlHours = typeof body.ttlHours === "number" && body.ttlHours > 0 ? Math.floor(body.ttlHours) : 72;
  const created = service.createProjectShare(projectId, body.permission, ttlHours);
  if (!created) { reply.code(404); return { message: "项目不存在" }; }
  return created;
}

async function handleAccessShare(service: PlatformService, request: FastifyRequest, reply: FastifyReply) {
  const token = (request.params as { token: string }).token;
  const access = service.accessShare(token);
  if (!access.ok) {
    reply.code(access.reason === "share_expired" ? 410 : 404);
    return { message: access.reason === "share_expired" ? "分享链接已过期" : "分享链接不存在" };
  }
  return access.data;
}

async function handleCommentByShare(service: PlatformService, request: FastifyRequest, reply: FastifyReply) {
  const token = (request.params as { token: string }).token;
  const content = ((request.body as { content?: string } | null)?.content || "").trim();
  if (!content) { reply.code(400); return { message: "内容不能为空" }; }
  const result = service.commentByShare(token, content);
  if (!result.ok) {
    const codeMap: Record<string, number> = { permission_denied: 403, share_expired: 410 };
    reply.code(codeMap[result.reason] || 404);
    const msgMap: Record<string, string> = { permission_denied: "没有评论权限", share_expired: "分享链接已过期", share_not_found: "分享链接不存在", project_not_found: "项目不存在" };
    return { message: msgMap[result.reason] || "操作失败" };
  }
  return result.data;
}

export function registerCollabShareRoutes(
  app: FastifyInstance, service: PlatformService, workspaceService: WorkspaceService, ensurePermission: EnsurePermission
) {
  app.get("/collab/shares", {
    schema: { querystring: { type: "object", properties: { projectId: { type: "string", pattern: "^\\d+$" } } } }
  }, (req, rep) => handleListShares(service, workspaceService, req, rep));

  app.post("/collab/shares", {
    schema: { body: { type: "object", properties: {
      projectId: { type: "integer" }, permission: { type: "string", enum: ["read", "comment"] }, ttlHours: { type: "integer" },
    }, additionalProperties: false } }
  }, (req, rep) => handleCreateShare(service, workspaceService, req, rep, ensurePermission));

  app.get("/collab/share/:token", {
    schema: { params: { type: "object", properties: { token: { type: "string", minLength: 1 } } } }
  }, (req, rep) => handleAccessShare(service, req, rep));

  app.post("/collab/share/:token/comments", {
    schema: { params: { type: "object", properties: { token: { type: "string" } } },
      body: { type: "object", properties: { content: { type: "string", minLength: 1 } }, additionalProperties: false } }
  }, (req, rep) => handleCommentByShare(service, req, rep));
}
