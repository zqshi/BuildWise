import { LlmInvocationError, LlmUnavailableError } from "../../../application/workspace/agentRunner";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { DuplicateAttachmentUploadError, WorkspaceBindingConflictError } from "../../../application/workspace/workspaceErrors";
import { resolveErrorMessage } from "../../../shared/utils";

export function parsePositiveInt(value: string | undefined) {
  if (!value) return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function currentRole(authRole: string | undefined) {
  const role = authRole?.trim().toLowerCase() || "viewer";
  return role === "admin" ? "owner" : role;
}

export function isAdmin(role: string) {
  return role === "owner";
}

export function currentUserId(request: import("fastify").FastifyRequest) {
  if (request.authSub) {
    return request.authSub;
  }
  const raw = request.headers["x-user-id"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function currentTenantId(request: import("fastify").FastifyRequest) {
  if (request.authTenantId) {
    return request.authTenantId.trim();
  }
  const raw = request.headers["x-tenant-id"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function ensureAuthenticatedUser(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  const userId = currentUserId(request);
  if (!userId) {
    reply.code(401);
    return null;
  }
  return userId;
}

export function ensureProjectAccess(
  service: WorkspaceService,
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  projectId: number,
  access: "read" | "write" | "admin"
) {
  const role = currentRole(request.authRole);
  if (role === "owner") {
    const project = service.findProject(projectId);
    if (!project) {
      reply.code(404);
      return null;
    }
    const tenantId = (project.tenantId || project.ownerUserId || "").trim();
    if (!tenantId) {
      return {
        project: {
          ...project,
          currentUserRole: "owner" as const
        },
        tenantId: "",
        tenantRole: "admin" as const,
        workspaceRole: "owner" as const,
        canRead: true,
        canWrite: true,
        canManageTenant: true
      };
    }
  }
  const userId = ensureAuthenticatedUser(request, reply);
  if (!userId) {
    return null;
  }
  const context = service.getProjectAccess(userId, projectId);
  if (!context.project) {
    reply.code(404);
    return null;
  }
  const allowed = access === "read" ? context.canRead : access === "write" ? context.canWrite : context.canManageTenant;
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return context;
}

export function ensureIterationAccess(
  service: WorkspaceService,
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  iterationId: number,
  access: "read" | "write" | "admin"
) {
  const role = currentRole(request.authRole);
  if (role === "owner") {
    const iteration = service.findIteration(iterationId);
    if (!iteration) {
      reply.code(404);
      return null;
    }
    const project = service.findProject(iteration.projectId);
    const tenantId = (project?.tenantId || project?.ownerUserId || "").trim();
    if (!tenantId) {
      return {
        iteration,
        projectAccess: {
          project: project
            ? {
                ...project,
                currentUserRole: "owner" as const
              }
            : null,
          tenantId: "",
          tenantRole: "admin" as const,
          workspaceRole: "owner" as const,
          canRead: true,
          canWrite: true,
          canManageTenant: true
        }
      };
    }
  }
  const userId = ensureAuthenticatedUser(request, reply);
  if (!userId) {
    return null;
  }
  const context = service.getIterationAccess(userId, iterationId);
  if (!context.iteration) {
    reply.code(404);
    return null;
  }
  const allowed =
    access === "read" ? context.projectAccess.canRead : access === "write" ? context.projectAccess.canWrite : context.projectAccess.canManageTenant;
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return context;
}

export function isValidPhone(phone: string) {
  return /^1\d{10}$/.test(phone);
}

export function resolveLlmErrorStatus(error: unknown): 502 | 503 | null {
  if (error instanceof LlmUnavailableError) {
    return 503;
  }
  if (error instanceof LlmInvocationError) {
    return 502;
  }
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (/^llm_http_\d+/i.test(message) || /^llm_/i.test(message)) {
    return 502;
  }
  // fetch AbortError (timeout) → 502
  if (name === "AbortError" || /aborted/i.test(message)) {
    return 502;
  }
  // Network connectivity errors → 502
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message)) {
    return 502;
  }
  return null;
}

/**
 * Centralized route error handler.
 * Returns `{ code, message }` when the error is recognized, or `null` to let the caller re-throw.
 */
export function handleRouteError(error: unknown): { code: number; message: string } | null {
  if (error instanceof DuplicateAttachmentUploadError) {
    return { code: 409, message: "duplicate_upload" };
  }
  if (error instanceof WorkspaceBindingConflictError) {
    return { code: 409, message: "workspace_path_already_bound" };
  }
  const llmStatus = resolveLlmErrorStatus(error);
  if (llmStatus) {
    return { code: llmStatus, message: resolveErrorMessage(error) };
  }
  return null;
}
