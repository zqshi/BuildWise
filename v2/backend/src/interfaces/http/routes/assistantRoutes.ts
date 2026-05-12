import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole } from "./workspaceRouteUtils";

async function handleAssistantChat(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as { message?: string; tenantId?: string } | null;
  const message = body?.message?.trim();
  if (!message) { reply.code(400); return { message: "请输入消息内容" }; }
  const tenantId = body?.tenantId || "default";
  try {
    return await service.assistantChat(tenantId, message);
  } catch (error) {
    reply.code(500);
    return { message: "助手服务异常，请稍后重试" };
  }
}

async function handleListMessages(service: WorkspaceService, request: FastifyRequest, _reply: FastifyReply) {
  const tenantId = (request.query as Record<string, string>).tenantId || "default";
  const limit = parseInt((request.query as Record<string, string>).limit || "50", 10);
  return service.listAssistantMessages(tenantId, Math.min(limit, 100));
}

async function handleClearMessages(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as { tenantId?: string } | null;
  const tenantId = body?.tenantId || "default";
  service.clearAssistantMessages(tenantId);
  return { ok: true };
}

export function registerAssistantRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/assistant/chat", {
    schema: { body: { type: "object", properties: { message: { type: "string" }, tenantId: { type: "string" } }, required: ["message"] } }
  }, (req, rep) => handleAssistantChat(service, req, rep));

  app.get("/assistant/messages", (req, rep) => handleListMessages(service, req, rep));

  app.post("/assistant/clear", {
    schema: { body: { type: "object", properties: { tenantId: { type: "string" } } } }
  }, (req, rep) => handleClearMessages(service, req, rep));
}
