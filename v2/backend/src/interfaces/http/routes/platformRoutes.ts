import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import { hasPermission } from "../../../application/platform/platformSupport";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

function ensurePermission(authRole: string | undefined, permission: string, workspaceService: WorkspaceService) {
  const role = currentRole(authRole);
  const grantedPermissions = workspaceService.governance.resolveRolePermissions(role);
  if (!hasPermission(role, permission, grantedPermissions)) {
    return { ok: false as const, role };
  }
  return { ok: true as const, role };
}

export async function registerPlatformRoutes(app: FastifyInstance, service: PlatformService, workspaceService: WorkspaceService) {
  app.get("/collab/snapshots", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listVersionSnapshots(projectId);
  });

  app.post("/collab/snapshots", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          iterationId: { type: "integer" },
          name: { type: "string" },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "collab:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { projectId?: number; iterationId?: number; name?: string; note?: string } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const iterationId = typeof body?.iterationId === "number" ? body.iterationId : null;
    const name = body?.name?.trim();
    if (!projectId || !iterationId || !name) {
      reply.code(400);
      return { message: "projectId, iterationId and name are required" };
    }
    const projectAccess = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!projectAccess) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const iterationAccess = ensureIterationAccess(workspaceService, request, reply, iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "project or iteration not found" : "permission denied" };
    }
    const created = service.createVersionSnapshot(projectId, iterationId, name, body?.note?.trim() || "");
    if (!created) {
      reply.code(404);
      return { message: "project or iteration not found" };
    }
    return created;
  });

  app.post("/collab/snapshots/:id/restore", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "collab:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const snapshotId = parsePositiveInt(params.id);
    if (snapshotId === null) {
      reply.code(400);
      return { message: "invalid snapshot id" };
    }
    const result = service.restoreVersionSnapshot(snapshotId);
    if (!result) {
      reply.code(404);
      return { message: "snapshot not found" };
    }
    return result;
  });

  app.get("/collab/shares", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listProjectShares(projectId);
  });

  app.post("/collab/shares", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          permission: { type: "string", enum: ["read", "comment"] },
          ttlHours: { type: "integer" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "collab:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { projectId?: number; permission?: "read" | "comment"; ttlHours?: number } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId || !body?.permission) {
      reply.code(400);
      return { message: "projectId and permission are required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const ttlHours = typeof body.ttlHours === "number" && body.ttlHours > 0 ? Math.floor(body.ttlHours) : 72;
    const created = service.createProjectShare(projectId, body.permission, ttlHours);
    if (!created) {
      reply.code(404);
      return { message: "project not found" };
    }
    return created;
  });

  app.get("/templates", async () => {
    return service.listTemplates();
  });

  app.post("/templates/:id/run", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string" } }
      },
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          parameters: { type: "object" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "template:run", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const body = request.body as { projectId?: number; parameters?: Record<string, string> } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const result = service.runTemplateWithParams(params.id, projectId, body?.parameters || {});
    if (!result) {
      reply.code(404);
      return { message: "template or project not found" };
    }
    return result;
  });

  app.get("/templates/runs", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listTemplateRuns(projectId);
  });

  app.get("/collab/share/:token", {
    schema: {
      params: {
        type: "object",
        properties: { token: { type: "string", minLength: 1 } }
      }
    }
  }, async (request, reply) => {
    const params = request.params as { token: string };
    const access = service.accessShare(params.token);
    if (!access.ok) {
      reply.code(access.reason === "share_expired" ? 410 : 404);
      return { message: access.reason };
    }
    return access.data;
  });

  app.post("/collab/share/:token/comments", {
    schema: {
      params: {
        type: "object",
        properties: { token: { type: "string" } }
      },
      body: {
        type: "object",
        properties: {
          content: { type: "string", minLength: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { token: string };
    const body = request.body as { content?: string } | null;
    const content = body?.content?.trim() || "";
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    const result = service.commentByShare(params.token, content);
    if (!result.ok) {
      if (result.reason === "permission_denied") {
        reply.code(403);
      } else if (result.reason === "share_expired") {
        reply.code(410);
      } else {
        reply.code(404);
      }
      return { message: result.reason };
    }
    return result.data;
  });

  app.get("/ops/deployments", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listDeployments(projectId);
  });

  app.post("/ops/deployments", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          iterationId: { type: "integer" },
          environment: { type: "string", enum: ["staging", "production"] },
          version: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as {
      projectId?: number;
      iterationId?: number;
      environment?: "staging" | "production";
      version?: string;
    } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const iterationId = typeof body?.iterationId === "number" ? body.iterationId : undefined;
    const environment = body?.environment;
    const version = body?.version?.trim();
    if (!projectId || !environment || !version) {
      reply.code(400);
      return { message: "projectId, environment and version are required" };
    }
    const projectAccess = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!projectAccess) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    if (typeof iterationId === "number") {
      const iterationAccess = ensureIterationAccess(workspaceService, request, reply, iterationId, "write");
      if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
        if (reply.statusCode === 200) {
          reply.code(iterationAccess ? 404 : reply.statusCode);
        }
        return { message: iterationAccess ? "project or iteration not found" : "permission denied" };
      }
    }
    if (!["staging", "production"].includes(environment)) {
      reply.code(400);
      return { message: "invalid environment" };
    }
    const created = service.createDeployment(projectId, environment, version, iterationId);
    if (!created.ok) {
      if (created.reason === "project_not_found" || created.reason === "iteration_not_found") {
        reply.code(404);
        return { message: created.reason === "project_not_found" ? "project not found" : "iteration not found" };
      }
      if (created.reason === "release_gate_blocked") {
        reply.code(409);
        return { message: created.message || "release gate blocked", blockers: created.blockers || [] };
      }
      reply.code(404);
      return { message: "project not found" };
    }
    return created.data;
  });

  app.post("/ops/deployments/:id/transition", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      },
      body: {
        type: "object",
        properties: {
          toStatus: { type: "string", enum: ["running", "success", "failed"] }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:transition", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const body = request.body as { toStatus?: "running" | "success" | "failed" } | null;
    const deploymentId = parsePositiveInt(params.id);
    if (!deploymentId || !body?.toStatus) {
      reply.code(400);
      return { message: "deployment id and toStatus are required" };
    }
    const deployment = service.getDeployment(deploymentId);
    if (!deployment) {
      reply.code(404);
      return { message: "deployment not found" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, deployment.projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const result = service.transitionDeployment(deploymentId, body.toStatus);
    if (!result.ok) {
      if (result.reason === "deployment_not_found") {
        reply.code(404);
        return { message: "deployment not found" };
      }
      reply.code(409);
      return { message: "invalid deployment transition" };
    }
    return result.data;
  });

  app.get("/ops/metrics", async () => {
    return service.getOpsMetrics();
  });

  app.get("/ops/triage-templates", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listOpsTriageTemplatesByProject(projectId);
  });

  app.post("/ops/triage-templates", {
    schema: {
      body: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "integer" },
          category: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          commands: { type: "array", items: { type: "string" } },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as {
      id?: string;
      projectId?: number;
      category?: string;
      keywords?: string[];
      commands?: string[];
      note?: string;
    } | null;
    const category = body?.category?.trim() || "general";
    const keywords = Array.isArray(body?.keywords) ? body?.keywords : [];
    const commands = Array.isArray(body?.commands) ? body?.commands : [];
    if (typeof body?.projectId === "number") {
      const access = ensureProjectAccess(workspaceService, request, reply, body.projectId, "write");
      if (!access) {
        return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
      }
    }
    const result = service.upsertOpsTriageTemplate({
      id: body?.id,
      projectId: typeof body?.projectId === "number" ? body.projectId : undefined,
      category,
      keywords,
      commands,
      note: body?.note
    });
    if (!result.ok) {
      reply.code(400);
      return { message: "invalid template payload" };
    }
    return result.data;
  });

  app.delete("/ops/triage-templates/:id", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } }
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const templateId = params.id?.trim();
    if (!templateId) {
      reply.code(400);
      return { message: "template id is required" };
    }
    const result = service.deleteOpsTriageTemplate(templateId);
    if (!result.ok) {
      reply.code(404);
      return { message: "template not found" };
    }
    return { ok: true };
  });

  app.post("/ops/triage/analyze", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          title: { type: "string" },
          description: { type: "string" },
          signals: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "ops:triage", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as {
      projectId?: number;
      severity?: "low" | "medium" | "high" | "critical";
      title?: string;
      description?: string;
      signals?: string[];
    } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const title = body?.title?.trim() || "";
    if (!projectId || !title) {
      reply.code(400);
      return { message: "projectId and title are required" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.analyzeOpsAlert({
      projectId,
      severity: body?.severity,
      title,
      description: body?.description,
      signals: Array.isArray(body?.signals) ? body?.signals : []
    });
  });
}
