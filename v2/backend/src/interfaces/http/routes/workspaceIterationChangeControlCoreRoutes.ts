import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { ensureIterationAccess } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

async function handleGetChangeControl(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const result = service.changeControl.getIterationChangeControl(iterationId);
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

async function handleConfirmAnalysis(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as {
    accurate?: boolean; note?: string; actor?: string; force?: boolean;
    resolvedClarificationQuestions?: string[];
    boundary?: { requirementRefs?: string[]; componentRefs?: string[]; codePaths?: string[]; note?: string };
  } | null;
  if (typeof body?.accurate !== "boolean") { reply.code(400); return { message: "请提供确认结论（accurate 布尔值）" }; }
  const result = service.changeControl.confirmIterationAnalysis(iterationId, {
    accurate: body.accurate, note: body.note, actor: body.actor, force: body.force === true,
    resolvedClarificationQuestions: body.resolvedClarificationQuestions, boundary: body.boundary,
  });
  if (!result.ok) return resolveConfirmError(reply, result);
  return result.data;
}

function resolveConfirmError(reply: FastifyReply, result: { ok: false; reason: string; quality?: unknown; unresolvedQuestions?: unknown }) {
  if (result.reason === "report_not_publishable") {
    reply.code(409); return { message: "分析报告质量评估未通过，无法确认", quality: result.quality };
  }
  if (result.reason === "clarification_questions_unresolved") {
    reply.code(409); return { message: "还有未解决的澄清问题，请先在对话中回复", unresolvedQuestions: result.unresolvedQuestions };
  }
  reply.code(404); return { message: "迭代不存在" };
}

async function handleUpdateBoundary(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { requirementRefs?: string[]; componentRefs?: string[]; codePaths?: string[]; note?: string } | null;
  const result = service.changeControl.updateIterationBoundary(iterationId, {
    requirementRefs: body?.requirementRefs, componentRefs: body?.componentRefs, codePaths: body?.codePaths, note: body?.note,
  });
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

async function handleUpdateClarificationDraft(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { resolvedQuestions?: string[] } | null;
  const updated = service.changeControl.updateClarificationDraft(iterationId, Array.isArray(body?.resolvedQuestions) ? body.resolvedQuestions : []);
  if (!updated) { reply.code(404); return { message: "迭代不存在" }; }
  return updated;
}

export function registerWorkspaceIterationChangeControlCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/change-control", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetChangeControl(service, req, rep));

  app.post("/iterations/:id/change-control/confirm", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      accurate: { type: "boolean" }, note: { type: "string" }, actor: { type: "string" }, force: { type: "boolean" },
      resolvedClarificationQuestions: { type: "array", items: { type: "string" } },
      boundary: { type: "object", properties: {
        requirementRefs: { type: "array", items: { type: "string" } }, componentRefs: { type: "array", items: { type: "string" } },
        codePaths: { type: "array", items: { type: "string" } }, note: { type: "string" },
      } },
    }, required: ["accurate"], additionalProperties: false } }
  }, (req, rep) => handleConfirmAnalysis(service, req, rep));

  app.post("/iterations/:id/change-control/boundary", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      requirementRefs: { type: "array", items: { type: "string" } }, componentRefs: { type: "array", items: { type: "string" } },
      codePaths: { type: "array", items: { type: "string" } }, note: { type: "string" },
    }, additionalProperties: false } }
  }, (req, rep) => handleUpdateBoundary(service, req, rep));

  app.post("/iterations/:id/change-control/draft", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      resolvedQuestions: { type: "array", items: { type: "string" } },
    }, additionalProperties: false } }
  }, (req, rep) => handleUpdateClarificationDraft(service, req, rep));
}
