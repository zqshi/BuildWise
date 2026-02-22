import type { FastifyInstance } from "fastify";
import { LlmInvocationError, LlmUnavailableError } from "../../../application/workspace/agentRunner";
import type { AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { parsePositiveInt } from "./workspaceRouteUtils";

function parseAttachmentUploadInput(body: {
  fileName?: string;
  mimeType?: string;
  size?: number;
  excerpt?: string;
  sourceType?: "single-file" | "folder";
  folderName?: string;
  files?: Array<{ path?: string; fileName?: string; mimeType?: string; size?: number; excerpt?: string }>;
  excerptChunks?: string[];
  excerptDigest?: string;
  excerptStrategy?: "direct" | "chunked-head-middle-tail" | "binary-no-text" | "folder-batch";
  agentScope?: "attachment" | "iteration" | "full-cycle" | "release";
  forceMultiAgent?: boolean;
  autoTransition?: boolean;
} | null): { input: AttachmentUploadInput | null; error: string } {
  const fileName = body?.fileName?.trim();
  if (!fileName) {
    return { input: null, error: "fileName is required" };
  }
  if (body?.sourceType === "folder" && (!Array.isArray(body.files) || body.files.length === 0)) {
    return { input: null, error: "files[] is required when sourceType=folder" };
  }
  return {
    input: {
      fileName,
      mimeType: body?.mimeType?.trim() || "application/octet-stream",
      size: typeof body?.size === "number" && Number.isFinite(body.size) ? body.size : 0,
      excerpt: body?.excerpt?.slice(0, 8000) || "",
      sourceType: body?.sourceType === "folder" ? "folder" : "single-file",
      folderName: body?.folderName?.trim() || "",
      files: Array.isArray(body?.files)
        ? body.files
            .map((item) => ({
              path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
              fileName: typeof item?.fileName === "string" ? item.fileName.slice(0, 120) : "",
              mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "application/octet-stream",
              size: typeof item?.size === "number" && Number.isFinite(item.size) ? item.size : 0,
              excerpt: typeof item?.excerpt === "string" ? item.excerpt.slice(0, 1200) : ""
            }))
            .filter((item) => item.fileName.trim().length > 0)
            .slice(0, 1000)
        : [],
      excerptChunks: Array.isArray(body?.excerptChunks)
        ? body.excerptChunks
            .map((item) => String(item).slice(0, 2000))
            .filter((item) => item.trim())
            .slice(0, 8)
        : [],
      excerptDigest: body?.excerptDigest?.slice(0, 300) || "",
      excerptStrategy: body?.excerptStrategy,
      agentScope: body?.agentScope,
      forceMultiAgent: Boolean(body?.forceMultiAgent),
      autoTransition: Boolean(body?.autoTransition)
    },
    error: ""
  };
}

export function registerWorkspaceIterationCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/api/iterations/:id/messages", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    return service.listMessages(iterationId);
  });

  app.post("/api/iterations/:id/messages", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as { role?: "system" | "assistant" | "user"; content?: string } | null;
    const role = body?.role ?? "user";
    const content = body?.content?.trim();
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    return service.createMessage(iterationId, role, content);
  });

  app.post("/api/iterations/:id/interaction-state", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as {
      hasPrototypeAssets?: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    } | null;
    if (typeof body?.hasPrototypeAssets !== "boolean") {
      reply.code(400);
      return { message: "hasPrototypeAssets is required" };
    }
    const updated = service.updateIterationInteractionState(iterationId, {
      hasPrototypeAssets: body.hasPrototypeAssets,
      uploadKind: body.uploadKind,
      lastAttachmentName: body.lastAttachmentName
    });
    if (!updated) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return { ok: true, iterationId: updated.id, interactionState: updated.interactionState };
  });

  app.post("/api/iterations/:id/agent-chat", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    let result;
    try {
      result = await service.coachIterationConversation(iterationId, message);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        reply.code(503);
        return { message: error.message };
      }
      if (error instanceof LlmInvocationError) {
        reply.code(502);
        return { message: error.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/visual-edit/execute", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as {
      message?: string;
      target?: {
        mode?: "html" | "image" | "prototype";
        target?: string;
        summary?: string;
        html?: {
          selector?: string;
          tag?: string;
          text?: string;
          styles?: Record<string, string>;
        };
      };
    } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    let result;
    try {
      result = await service.executeVisualEditInstruction(iterationId, message, body?.target);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        reply.code(503);
        return { message: error.message };
      }
      if (error instanceof LlmInvocationError) {
        reply.code(502);
        return { message: error.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/code-rewrite", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as { instruction?: string; dryRun?: boolean; maxFiles?: number } | null;
    const instruction = body?.instruction?.trim() || "";
    if (!instruction) {
      reply.code(400);
      return { message: "instruction is required" };
    }
    let result;
    try {
      result = await service.rewriteCodeInBoundary(iterationId, {
        instruction,
        dryRun: body?.dryRun !== false,
        maxFiles: typeof body?.maxFiles === "number" ? body.maxFiles : undefined
      });
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        reply.code(503);
        return { message: error.message };
      }
      if (error instanceof LlmInvocationError) {
        reply.code(502);
        return { message: error.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/analysis", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as Parameters<typeof parseAttachmentUploadInput>[0];
    const parsed = parseAttachmentUploadInput(body);
    if (!parsed.input) {
      reply.code(400);
      return { message: parsed.error };
    }
    let result;
    try {
      result = await service.analyzeAttachment(iterationId, parsed.input);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        reply.code(503);
        return { message: error.message };
      }
      if (error instanceof LlmInvocationError) {
        reply.code(502);
        return { message: error.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/analysis/jobs", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as Parameters<typeof parseAttachmentUploadInput>[0];
    const parsed = parseAttachmentUploadInput(body);
    if (!parsed.input) {
      reply.code(400);
      return { message: parsed.error };
    }
    const created = service.submitAttachmentAnalysisJob(iterationId, parsed.input);
    if (!created) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    reply.code(202);
    return created;
  });

  app.get("/api/iterations/:id/analysis/jobs/:jobId", async (request, reply) => {
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const jobId = (params.jobId || "").trim();
    if (!jobId) {
      reply.code(400);
      return { message: "invalid job id" };
    }
    const job = service.getAttachmentAnalysisJob(iterationId, jobId);
    if (!job) {
      reply.code(404);
      return { message: "analysis job not found" };
    }
    return job;
  });

  app.get("/api/iterations/:id/context", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const context = service.getIterationContext(iterationId);
    if (!context) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return context;
  });

  app.get("/api/iterations/:id/state-machine", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const stateMachine = service.getStateMachine(iterationId);
    if (!stateMachine) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return stateMachine;
  });

  app.post("/api/iterations/:id/state/transition", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const body = request.body as { toStatus?: string; note?: string } | null;
    const toStatus = body?.toStatus?.trim();
    if (!toStatus) {
      reply.code(400);
      return { message: "toStatus is required" };
    }
    const transition = service.transitionIteration(
      iterationId,
      toStatus as "planned" | "in-progress" | "review" | "blocked" | "completed",
      body?.note?.trim() || ""
    );
    if (!transition.ok) {
      if (transition.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (transition.reason === "invalid_transition") {
        reply.code(409);
        return { message: "invalid transition" };
      }
      reply.code(400);
      return { message: "transition failed" };
    }
    return transition.data;
  });

  app.get("/api/iterations/:id/assessment", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const result = service.getAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.get("/api/iterations/:id/assessment/history", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    return service.listAssessmentSnapshots(iterationId);
  });

  app.post("/api/iterations/:id/assessment/recompute", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const result = service.recomputeAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/api/iterations/:id/assessment/restore/:snapshotId", async (request, reply) => {
    const params = request.params as { id: string; snapshotId: string };
    const iterationId = parsePositiveInt(params.id);
    const snapshotId = parsePositiveInt(params.snapshotId);
    if (iterationId === null || snapshotId === null) {
      reply.code(400);
      return { message: "invalid iteration id or snapshot id" };
    }
    const result = service.restoreSnapshot(iterationId, snapshotId);
    if (!result) {
      reply.code(404);
      return { message: "iteration or snapshot not found" };
    }
    return result;
  });
}
