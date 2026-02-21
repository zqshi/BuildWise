import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspaceProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  const validVersionTypes = new Set(["major", "minor", "patch"]);
  app.get("/api/governance/roles", async () => {
    return service.listGovernanceRoles();
  });

  app.get("/api/governance/audit-logs", async (request, reply) => {
    const query = request.query as { limit?: string } | null;
    const limit = query?.limit ? Number(query.limit) : 50;
    if (!Number.isFinite(limit) || limit <= 0) {
      reply.code(400);
      return { message: "invalid limit" };
    }
    return service.listAuditLogs(Math.min(200, Math.floor(limit)));
  });

  app.get("/api/projects", async () => {
    return service.listProjects();
  });

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as { name?: string; description?: string } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    return service.createProject({
      name,
      description: body?.description?.trim() || "暂无描述"
    });
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const archived = service.archiveProject(projectId);
    if (!archived) {
      reply.code(404);
      return { message: "project not found" };
    }
    return {
      ok: true,
      projectId: archived.id,
      deletedAt: archived.deletedAt || ""
    };
  });

  app.get("/api/projects/:id/iterations", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const items = service.listIterations(projectId);
    if (items === null) {
      reply.code(404);
      return { message: "project not found" };
    }
    return items;
  });

  app.post("/api/projects/:id/iterations", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const body = request.body as {
      name?: string;
      description?: string;
      versionType?: string;
      goals?: string[];
      scope?: {
        inScope?: string[];
        outOfScope?: string[];
        acceptanceCriteria?: string[];
      };
      aiSummary?: string;
    } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    const versionType = body?.versionType?.trim().toLowerCase() || "patch";
    if (!validVersionTypes.has(versionType)) {
      reply.code(400);
      return { message: "versionType must be one of: major, minor, patch" };
    }
    const created = service.createIteration(projectId, {
      name,
      description: body?.description?.trim() || "暂无描述",
      versionType: versionType as "major" | "minor" | "patch",
      goals: Array.isArray(body?.goals) ? body?.goals : [],
      aiSummary: body?.aiSummary || "",
      scope: {
        inScope: Array.isArray(body?.scope?.inScope) ? body?.scope?.inScope : [],
        outOfScope: Array.isArray(body?.scope?.outOfScope) ? body?.scope?.outOfScope : [],
        acceptanceCriteria: Array.isArray(body?.scope?.acceptanceCriteria) ? body?.scope?.acceptanceCriteria : []
      }
    });
    if (!created) {
      reply.code(404);
      return { message: "project not found" };
    }
    return created;
  });
}
