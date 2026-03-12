import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";

export function registerWorkspaceIterationChangeControlCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/api/iterations/:id/change-control", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const result = service.getIterationChangeControl(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/change-control/confirm", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const body = request.body as {
      accurate?: boolean;
      note?: string;
      actor?: string;
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

  app.post("/api/iterations/:id/change-control/boundary", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
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

  app.post("/api/iterations/:id/change-control/draft", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
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
