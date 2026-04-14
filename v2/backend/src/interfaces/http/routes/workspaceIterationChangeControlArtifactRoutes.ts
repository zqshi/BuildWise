import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { resolveArtifactId, resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { ensureIterationAccess } from "./workspaceRouteUtils";

export function registerWorkspaceIterationChangeControlArtifactRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/change-control/artifacts", {
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
    const result = service.changeControl.getIterationArtifactWorkflow(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/change-control/artifacts/:artifactId/draft", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          artifactId: { type: "string", minLength: 1 }
        },
        required: ["id", "artifactId"]
      },
      body: {
        type: "object",
        properties: {
          content: { type: "string" },
          media: { type: "array", items: { type: "string" } },
          actor: { type: "string" }
        },
        required: ["content"],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
    const result = service.changeControl.saveIterationArtifactDraft(iterationId, artifactId, {
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

  app.post("/iterations/:id/change-control/artifacts/:artifactId/commit", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          artifactId: { type: "string", minLength: 1 }
        },
        required: ["id", "artifactId"]
      },
      body: {
        type: "object",
        properties: {
          actor: { type: "string" },
          summary: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          source: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
    const result = service.changeControl.commitIterationArtifact(iterationId, artifactId, {
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

  app.post("/iterations/:id/change-control/artifacts/:artifactId/confirm", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          artifactId: { type: "string", minLength: 1 }
        },
        required: ["id", "artifactId"]
      },
      body: {
        type: "object",
        properties: {
          actor: { type: "string" },
          passed: { type: "boolean" },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
    const result = service.changeControl.confirmIterationArtifact(iterationId, artifactId, {
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

  app.post("/iterations/:id/change-control/artifacts/:artifactId/add-to-chat", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          artifactId: { type: "string", minLength: 1 }
        },
        required: ["id", "artifactId"]
      },
      body: {
        type: "object",
        properties: {
          actor: { type: "string" },
          prompt: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
    const result = service.changeControl.appendIterationArtifactToConversation(iterationId, artifactId, {
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

  app.post("/iterations/:id/change-control/stage/transition", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          toStage: { type: "string", enum: ["clarification", "scope", "interaction", "development", "testing", "release", "archive"] },
          actor: { type: "string" },
          note: { type: "string" }
        },
        required: ["toStage"],
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
      toStage?: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive";
      actor?: string;
      note?: string;
    } | null;
    if (!body?.toStage) {
      reply.code(400);
      return { message: "toStage is required" };
    }
    const result = service.changeControl.transitionIterationArtifactStage(iterationId, body.toStage, {
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
