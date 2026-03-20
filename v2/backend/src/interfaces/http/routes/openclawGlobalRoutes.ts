import type { FastifyInstance } from "fastify";
import type { OpenclawGlobalService } from "../../../application/openclawGlobal/openclawGlobalService";
import { resolveErrorMessage } from "../../../shared/utils";
import { currentRole, isAdmin } from "./workspaceRouteUtils";

export async function registerOpenclawGlobalRoutes(app: FastifyInstance, service: OpenclawGlobalService) {
  // ---- 对话列表 ----
  app.get("/openclaw/conversations", async () => {
    return service.listConversations();
  });

  // ---- 创建对话 ----
  app.post("/openclaw/conversations", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const body = (request.body || {}) as { title?: string };
    return service.createConversation(body.title);
  });

  // ---- 查询对话消息 ----
  app.get("/openclaw/conversations/:id/messages", async (request, reply) => {
    const params = request.params as { id?: string };
    const conversationId = (params.id || "").trim();
    if (!conversationId) {
      reply.code(400);
      return { message: "invalid conversation id" };
    }
    const conversation = service.findConversation(conversationId);
    if (!conversation) {
      reply.code(404);
      return { message: "conversation not found" };
    }
    return service.listMessages(conversationId);
  });

  // ---- 发送消息 ----
  app.post("/openclaw/conversations/:id/messages", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const conversationId = (params.id || "").trim();
    const body = (request.body || {}) as { content?: string };
    const content = (body.content || "").trim();
    if (!conversationId) {
      reply.code(400);
      return { message: "invalid conversation id" };
    }
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    try {
      const [userMsg, assistantMsg] = await service.sendMessage(conversationId, content);
      return { userMessage: userMsg, assistantMessage: assistantMsg };
    } catch (error) {
      const message = resolveErrorMessage(error);
      if (message.startsWith("conversation_not_found")) {
        reply.code(404);
        return { message: "conversation not found" };
      }
      reply.code(500);
      return { message: "Internal server error" };
    }
  });

  // ---- Skill 列表 ----
  app.get("/openclaw/skills", async () => {
    return service.listSkills();
  });

  // ---- 激活 Skill ----
  app.post("/openclaw/skills/:id/activate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const skillId = (params.id || "").trim();
    if (!skillId) {
      reply.code(400);
      return { message: "invalid skill id" };
    }
    const result = service.activateSkill(skillId);
    if (!result) {
      reply.code(404);
      return { message: "skill not found" };
    }
    return result;
  });

  // ---- 废弃 Skill ----
  app.post("/openclaw/skills/:id/deprecate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const skillId = (params.id || "").trim();
    if (!skillId) {
      reply.code(400);
      return { message: "invalid skill id" };
    }
    const result = service.deprecateSkill(skillId);
    if (!result) {
      reply.code(404);
      return { message: "skill not found" };
    }
    return result;
  });

  // ---- 策略状态 ----
  app.get("/openclaw/strategy", async () => {
    return service.getStrategyState();
  });

  // ---- 恢复初始配置 ----
  app.post("/openclaw/strategy/restore-initial", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    return service.restoreInitialConfig();
  });
}
