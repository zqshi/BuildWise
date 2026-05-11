import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt, currentUserId } from "./workspaceRouteUtils";
import {
  ALLOWED_KNOWLEDGE_CATEGORIES,
  ALLOWED_KNOWLEDGE_STATUSES,
  ALLOWED_KNOWLEDGE_SOURCES
} from "../../../domain/workspace/knowledgeTypes";
import type { KnowledgeEntryFilter } from "../../../domain/workspace/knowledgeTypes";

const ID_PARAM = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id"] as const };
const ID_ENTRY_PARAM = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, entryId: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id", "entryId"] as const };

async function handleListKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const query = request.query as Record<string, string | undefined>;
  const filter: KnowledgeEntryFilter = {};
  if (query.category && ALLOWED_KNOWLEDGE_CATEGORIES.has(query.category)) filter.category = query.category as KnowledgeEntryFilter["category"];
  if (query.status && ALLOWED_KNOWLEDGE_STATUSES.has(query.status)) filter.status = query.status as KnowledgeEntryFilter["status"];
  if (query.source && ALLOWED_KNOWLEDGE_SOURCES.has(query.source)) filter.source = query.source as KnowledgeEntryFilter["source"];
  if (query.q) filter.q = query.q;
  return service.knowledge.listKnowledgeEntries(projectId, filter);
}

async function handleCreateKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as { title?: string; content?: string; category?: string; groupName?: string; applicableScene?: string; tags?: string[]; source?: string; sourceRef?: string; iterationId?: number | null } | null;
  const title = body?.title?.trim();
  if (!title) { reply.code(400); return { message: "标题不能为空" }; }
  const content = body?.content?.trim() || "";
  const category = body?.category && ALLOWED_KNOWLEDGE_CATEGORIES.has(body.category) ? body.category as "technical" | "business-rule" | "pitfall" | "architecture-decision" | "customer-experience" : "technical";
  const actor = currentUserId(request) || "system";
  const entry = service.knowledge.createKnowledgeEntry(projectId, {
    title,
    content,
    category,
    groupName: body?.groupName?.trim(),
    applicableScene: body?.applicableScene?.trim(),
    tags: Array.isArray(body?.tags) ? body.tags : undefined,
    source: body?.source && ALLOWED_KNOWLEDGE_SOURCES.has(body.source) ? body.source as "manual" | "analysis" | "coach" | "iteration-review" : undefined,
    sourceRef: body?.sourceRef,
    iterationId: body?.iterationId ?? undefined
  }, actor);
  if (!entry) { reply.code(404); return { message: "项目不存在或迭代无效" }; }
  reply.code(201);
  return entry;
}

async function handleGetKnowledgeEntry(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; entryId: string };
  const projectId = parsePositiveInt(params.id);
  const entryId = parsePositiveInt(params.entryId);
  if (projectId === null || entryId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const entry = service.knowledge.findKnowledgeEntry(entryId);
  if (!entry || entry.projectId !== projectId) { reply.code(404); return { message: "知识条目不存在" }; }
  return entry;
}

async function handleUpdateKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; entryId: string };
  const projectId = parsePositiveInt(params.id);
  const entryId = parsePositiveInt(params.entryId);
  if (projectId === null || entryId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as Record<string, unknown> | null;
  if (!body) { reply.code(400); return { message: "请求体不能为空" }; }
  const updated = service.knowledge.updateKnowledgeEntry(entryId, body as Parameters<typeof service.knowledge.updateKnowledgeEntry>[1]);
  if (!updated) { reply.code(404); return { message: "知识条目不存在" }; }
  return updated;
}

async function handleDeleteKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; entryId: string };
  const projectId = parsePositiveInt(params.id);
  const entryId = parsePositiveInt(params.entryId);
  if (projectId === null || entryId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "admin");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const deleted = service.knowledge.deleteKnowledgeEntry(entryId);
  if (!deleted) { reply.code(404); return { message: "知识条目不存在" }; }
  return { deleted: true };
}

async function handlePublishKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; entryId: string };
  const projectId = parsePositiveInt(params.id);
  const entryId = parsePositiveInt(params.entryId);
  if (projectId === null || entryId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const actor = currentUserId(request) || "system";
  const published = service.knowledge.publishKnowledgeEntry(entryId, actor);
  if (!published) { reply.code(404); return { message: "知识条目不存在或已归档" }; }
  return published;
}

async function handleGetKnowledgeGraph(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const cache = service.knowledge.getKnowledgeGraph(projectId);
  return cache || { graphData: null };
}

async function handleGenerateKnowledgeGraph(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  try {
    return await service.knowledge.generateKnowledgeGraph(projectId);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "llm_unavailable") {
      reply.code(503);
      return { message: "知识图谱生成需要配置 AI 服务" };
    }
    throw err;
  }
}

async function handleSearchKnowledge(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const query = (request.query as { q?: string }).q || "";
  if (!query.trim()) return [];
  return service.knowledge.searchKnowledge(projectId, query.trim());
}

export function registerWorkspaceKnowledgeRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/knowledge", { schema: { params: ID_PARAM } }, (req, rep) => handleListKnowledge(service, req, rep));
  app.post("/projects/:id/knowledge", { schema: { params: ID_PARAM } }, (req, rep) => handleCreateKnowledge(service, req, rep));
  app.get("/projects/:id/knowledge/search", { schema: { params: ID_PARAM } }, (req, rep) => handleSearchKnowledge(service, req, rep));
  app.get("/projects/:id/knowledge/graph", { schema: { params: ID_PARAM } }, (req, rep) => handleGetKnowledgeGraph(service, req, rep));
  app.post("/projects/:id/knowledge/graph/generate", { schema: { params: ID_PARAM } }, (req, rep) => handleGenerateKnowledgeGraph(service, req, rep));
  app.get("/projects/:id/knowledge/:entryId", { schema: { params: ID_ENTRY_PARAM } }, (req, rep) => handleGetKnowledgeEntry(service, req, rep));
  app.put("/projects/:id/knowledge/:entryId", { schema: { params: ID_ENTRY_PARAM } }, (req, rep) => handleUpdateKnowledge(service, req, rep));
  app.delete("/projects/:id/knowledge/:entryId", { schema: { params: ID_ENTRY_PARAM } }, (req, rep) => handleDeleteKnowledge(service, req, rep));
  app.post("/projects/:id/knowledge/:entryId/publish", { schema: { params: ID_ENTRY_PARAM } }, (req, rep) => handlePublishKnowledge(service, req, rep));
}
