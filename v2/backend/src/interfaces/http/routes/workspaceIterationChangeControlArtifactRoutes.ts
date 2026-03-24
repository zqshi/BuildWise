import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { resolveArtifactId, resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { ensureIterationAccess } from "./workspaceRouteUtils";

export function registerWorkspaceIterationChangeControlArtifactRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/change-control/artifacts", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.getIterationArtifactWorkflow(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/artifacts/:artifactId/draft", async (request, reply) => {
    const params = request.params as { id: string; artifactId: string };
    const iterationId = resolveIterationId(reply, params.id);
    const artifactId = resolveArtifactId(reply, params.artifactId);
    if (iterationId === null || artifactId === null) {
      return { message: "invalid iteration id or artifact id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { content?: string; media?: string[]; actor?: string } | null;
    const content = body?.content?.trim() || "";
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    const result = service.saveIterationArtifactDraft(iterationId, artifactId, {
      content,
      media: Array.isArray(body?.media) ? body.media : [],
      actor: body?.actor
    });
    if (result === null) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    if (typeof result === "undefined") {
      reply.code(404);
      return { message: "artifact not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/artifacts/:artifactId/commit", async (request, reply) => {
    const params = request.params as { id: string; artifactId: string };
    const iterationId = resolveIterationId(reply, params.id);
    const artifactId = resolveArtifactId(reply, params.artifactId);
    if (iterationId === null || artifactId === null) {
      return { message: "invalid iteration id or artifact id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { actor?: string; summary?: string; evidence?: string[]; source?: string } | null;
    const result = service.commitIterationArtifact(iterationId, artifactId, {
      actor: body?.actor,
      summary: body?.summary,
      evidence: Array.isArray(body?.evidence) ? body.evidence : [],
      source: body?.source
    });
    if (result === null) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    if (typeof result === "undefined") {
      reply.code(404);
      return { message: "artifact not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/artifacts/:artifactId/confirm", async (request, reply) => {
    const params = request.params as { id: string; artifactId: string };
    const iterationId = resolveIterationId(reply, params.id);
    const artifactId = resolveArtifactId(reply, params.artifactId);
    if (iterationId === null || artifactId === null) {
      return { message: "invalid iteration id or artifact id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { actor?: string; passed?: boolean; note?: string } | null;
    const result = service.confirmIterationArtifact(iterationId, artifactId, {
      actor: body?.actor,
      passed: body?.passed,
      note: body?.note
    });
    if (result === null) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    if (typeof result === "undefined") {
      reply.code(404);
      return { message: "artifact not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/artifacts/:artifactId/add-to-chat", async (request, reply) => {
    const params = request.params as { id: string; artifactId: string };
    const iterationId = resolveIterationId(reply, params.id);
    const artifactId = resolveArtifactId(reply, params.artifactId);
    if (iterationId === null || artifactId === null) {
      return { message: "invalid iteration id or artifact id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { actor?: string; prompt?: string } | null;
    const result = service.appendIterationArtifactToConversation(iterationId, artifactId, {
      actor: body?.actor,
      prompt: body?.prompt
    });
    if (result === null) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    if (typeof result === "undefined") {
      reply.code(404);
      return { message: "artifact not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/stage/transition", async (request, reply) => {
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
      toStage?: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive";
      actor?: string;
      note?: string;
    } | null;
    if (!body?.toStage) {
      reply.code(400);
      return { message: "toStage is required" };
    }
    const result = service.transitionIterationArtifactStage(iterationId, body.toStage, {
      actor: body.actor,
      note: body.note
    });
    if (!result.ok) {
      if (result.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (result.reason === "upstream_gate_not_passed") {
        reply.code(409);
        return { message: "upstream gate not passed", blockers: result.blockers };
      }
      if (result.reason === "invalid_stage_order") {
        reply.code(409);
        return { message: "invalid stage order", expectedNext: result.expectedNext };
      }
      reply.code(400);
      return { message: "invalid stage transition" };
    }
    return result.workflow;
  });
}
