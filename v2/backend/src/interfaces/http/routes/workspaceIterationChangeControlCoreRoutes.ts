import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { ensureIterationAccess } from "./workspaceRouteUtils";

export function registerWorkspaceIterationChangeControlCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/change-control", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.getIterationChangeControl(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/confirm", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          accurate: { type: "boolean" },
          note: { type: "string" },
          actor: { type: "string" },
          force: { type: "boolean" },
          resolvedClarificationQuestions: { type: "array", items: { type: "string" } },
          boundary: {
            type: "object",
            properties: {
              requirementRefs: { type: "array", items: { type: "string" } },
              componentRefs: { type: "array", items: { type: "string" } },
              codePaths: { type: "array", items: { type: "string" } },
              note: { type: "string" }
            }
          }
        },
        required: ["accurate"],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as {
      accurate?: boolean;
      note?: string;
      actor?: string;
      force?: boolean;
      resolvedClarificationQuestions?: string[];
      boundary?: {
        requirementRefs?: string[];
        componentRefs?: string[];
        codePaths?: string[];
        note?: string;
      };
    } | null;
    if (typeof body?.accurate !== "boolean") {
      reply.code(400);
      return { message: "accurate(boolean) is required" };
    }
    const result = service.confirmIterationAnalysis(iterationId, {
      accurate: body.accurate,
      note: body.note,
      actor: body.actor,
      force: body.force === true,
      resolvedClarificationQuestions: body.resolvedClarificationQuestions,
      boundary: body.boundary
    });
    if (!result.ok) {
      if (result.reason === "report_not_publishable") {
        reply.code(409);
        return {
          message: "report quality gate blocked confirmation",
          quality: result.quality
        };
      }
      if (result.reason === "clarification_questions_unresolved") {
        reply.code(409);
        return {
          message: "clarification questions unresolved",
          unresolvedQuestions: result.unresolvedQuestions
        };
      }
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result.data;
  });

  app.post("/iterations/:id/change-control/boundary", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          requirementRefs: { type: "array", items: { type: "string" } },
          componentRefs: { type: "array", items: { type: "string" } },
          codePaths: { type: "array", items: { type: "string" } },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as {
      requirementRefs?: string[];
      componentRefs?: string[];
      codePaths?: string[];
      note?: string;
    } | null;
    const result = service.updateIterationBoundary(iterationId, {
      requirementRefs: body?.requirementRefs,
      componentRefs: body?.componentRefs,
      codePaths: body?.codePaths,
      note: body?.note
    });
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/draft", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          resolvedQuestions: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { resolvedQuestions?: string[] } | null;
    const updated = service.updateClarificationDraft(iterationId, Array.isArray(body?.resolvedQuestions) ? body.resolvedQuestions : []);
    if (!updated) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return updated;
  });
}
