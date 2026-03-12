import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { parsePositiveInt } from "./workspaceRouteUtils";
import { registerWorkspacePolicyExecutionRoutes } from "./workspacePolicyExecutionRoutes";

function currentRole(authRole: string | undefined) {
  const role = authRole?.trim().toLowerCase() || "viewer";
  return role === "admin" ? "owner" : role;
}

function isAdmin(role: string) {
  return role === "owner";
}

function currentUserId(headers: Record<string, unknown>) {
  const raw = String(headers["x-user-id"] || headers["x-user"] || "system").trim();
  return raw || "system";
}

export function registerWorkspacePolicyRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/api/governance/orchestration/policies", async () => {
    return {
      active: service.getActiveGlobalOrchestrationPolicy(),
      items: service.listGlobalOrchestrationPolicies()
    };
  });

  app.post("/api/governance/orchestration/policies", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request.headers as Record<string, unknown>);
    return service.createGlobalOrchestrationPolicyDraft(actor, body?.strategy);
  });

  app.post("/api/governance/orchestration/policies/:version/activate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { version: string };
    const version = parsePositiveInt(params.version);
    if (version === null) {
      reply.code(400);
      return { message: "invalid version" };
    }
    const actor = currentUserId(request.headers as Record<string, unknown>);
    const activated = service.activateGlobalOrchestrationPolicy(version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "global orchestration policy version not found" };
    }
    return activated;
  });

  app.post("/api/governance/orchestration/policies/restore-initial", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const actor = currentUserId(request.headers as Record<string, unknown>);
    const restored = service.restoreGlobalOrchestrationPolicyToInitialMode(actor);
    if (!restored) {
      reply.code(500);
      return { message: "failed to restore global orchestration policy" };
    }
    return restored;
  });

  app.get("/api/projects/:id/policies", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    return {
      active: service.getActiveProjectPolicy(projectId),
      items: service.listProjectPolicies(projectId)
    };
  });

  app.post("/api/projects/:id/policies", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request.headers as Record<string, unknown>);
    return service.createProjectPolicyDraft(projectId, actor, body?.strategy);
  });

  app.post("/api/projects/:id/policies/:version/activate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string; version: string };
    const projectId = parsePositiveInt(params.id);
    const version = parsePositiveInt(params.version);
    if (projectId === null || version === null) {
      reply.code(400);
      return { message: "invalid project id or version" };
    }
    const actor = currentUserId(request.headers as Record<string, unknown>);
    const activated = service.activateProjectPolicy(projectId, version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "policy version not found" };
    }
    return activated;
  });

  app.post("/api/projects/:id/policies/restore-initial", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const actor = currentUserId(request.headers as Record<string, unknown>);
    const restored = service.restoreProjectOrchestrationPolicyToInitialMode(projectId, actor);
    if (!restored) {
      reply.code(500);
      return { message: "failed to restore project orchestration policy" };
    }
    return restored;
  });

  app.post("/api/projects/:id/workspace/bind", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const body = request.body as {
      openclawProfile?: string;
      agentId?: string;
      workspacePath?: string;
      runtimeMode?: "openclaw-native" | "bridge";
      locked?: boolean;
    } | null;
    if (!body?.openclawProfile?.trim() || !body?.workspacePath?.trim()) {
      reply.code(400);
      return { message: "openclawProfile and workspacePath are required" };
    }
    const actor = currentUserId(request.headers as Record<string, unknown>);
    return service.upsertProjectWorkspaceBinding({
      projectId,
      openclawProfile: body.openclawProfile.trim(),
      agentId: body.agentId?.trim() || "main",
      workspacePath: body.workspacePath.trim(),
      runtimeMode: body.runtimeMode === "bridge" ? "bridge" : "openclaw-native",
      locked: body.locked !== false,
      createdBy: actor
    });
  });

  app.get("/api/projects/:id/roles", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    return service.listProjectRoleBindings(projectId);
  });

  app.post("/api/projects/:id/roles", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const body = request.body as { userId?: string; role?: "admin" | "member" | "viewer" } | null;
    if (!body?.userId?.trim() || !body?.role) {
      reply.code(400);
      return { message: "userId and role are required" };
    }
    return service.upsertProjectRoleBinding({
      projectId,
      userId: body.userId.trim(),
      role: body.role
    });
  });

  app.delete("/api/projects/:id/roles/:userId", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string; userId: string };
    const projectId = parsePositiveInt(params.id);
    const userId = (params.userId || "").trim();
    if (projectId === null || !userId) {
      reply.code(400);
      return { message: "invalid project id or user id" };
    }
    const removed = service.removeProjectRoleBinding(projectId, userId);
    if (!removed) {
      reply.code(404);
      return { message: "role binding not found" };
    }
    return { ok: true, projectId, userId };
  });

  registerWorkspacePolicyExecutionRoutes(app, service);
}
