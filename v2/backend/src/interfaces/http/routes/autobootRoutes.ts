import type { FastifyInstance } from "fastify";
import type { ModelingService } from "../../../application/modeling/modelingService";
import { LlmInvocationError, LlmUnavailableError } from "../../../application/workspace/agentRunner";
import { currentRole, isAdmin, parsePositiveInt } from "./workspaceRouteUtils";

type ModelApi = {
  method?: string;
  path?: string;
};

function normalizeMethod(value: string) {
  const method = value.toUpperCase();
  if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  }
  return "GET";
}

function isCoreWorkspacePath(path: string) {
  return (
    path === "/api/projects" ||
    path.startsWith("/api/projects/:id/iterations") ||
    path.startsWith("/api/iterations/")
  );
}

function isCorePlatformPath(path: string) {
  return (
    path.startsWith("/api/collab/") ||
    path.startsWith("/api/templates") ||
    path.startsWith("/api/openapi/") ||
    path.startsWith("/api/ops/")
  );
}

export async function registerAutobootRoutes(app: FastifyInstance, service: ModelingService) {
  app.get("/api/model", async () => {
    return service.getModel();
  });

  app.get("/api/model/entities", async () => {
    return service.listEntities();
  });

  app.post("/api/model/entities", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const body = request.body as { name?: string; businessLabel?: string; fields?: unknown[] } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    return service.createEntity({
      name,
      businessLabel: body?.businessLabel?.trim(),
      fields: body?.fields
    });
  });

  app.get("/api/model/relations", async (request) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    return service.listRelations(projectId || undefined);
  });

  app.get("/api/projects/:id/model/relations", async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    return service.listRelations(projectId);
  });

  app.get("/api/projects/:id/model/business-summary", async (request, reply) => {
    const params = request.params as { id?: string };
    const query = request.query as { iterationId?: string } | null;
    const projectId = parsePositiveInt(params.id);
    const iterationId = parsePositiveInt(query?.iterationId);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    try {
      const summary = await service.generateProjectBusinessSummary({
        projectId,
        iterationId: iterationId || undefined
      });
      if (!summary) {
        reply.code(404);
        return { message: "project not found" };
      }
      return summary;
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
  });

  app.post("/api/model/relations", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const body = request.body as {
      projectId?: number;
      fromEntityId?: string;
      toEntityId?: string;
      type?: "one_to_one" | "one_to_many" | "many_to_many";
      name?: string;
    } | null;
    const fromEntityId = body?.fromEntityId?.trim();
    const toEntityId = body?.toEntityId?.trim();
    const type = body?.type;
    if (!fromEntityId || !toEntityId || !type) {
      reply.code(400);
      return { message: "fromEntityId, toEntityId and type are required" };
    }
    if (!["one_to_one", "one_to_many", "many_to_many"].includes(type)) {
      reply.code(400);
      return { message: "invalid relation type" };
    }
    const created = service.createRelation({
      projectId: typeof body?.projectId === "number" ? body.projectId : undefined,
      fromEntityId,
      toEntityId,
      type,
      name: body?.name?.trim()
    });
    if (!created.ok) {
      if (created.reason === "entity_not_found") {
        reply.code(404);
        return { message: "entity not found" };
      }
      if (created.reason === "relation_duplicated") {
        reply.code(409);
        return { message: "relation already exists" };
      }
      reply.code(400);
      return { message: "relation create failed" };
    }
    return created.value;
  });

  app.delete("/api/model/relations/:id", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const relationId = params.id?.trim();
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (!relationId) {
      reply.code(400);
      return { message: "invalid relation id" };
    }
    const ok = service.deleteRelation(relationId, projectId || undefined);
    if (!ok) {
      reply.code(404);
      return { message: "relation not found" };
    }
    return { ok: true, id: relationId };
  });

  app.get("/api/rules/compile", async () => {
    return service.compileRules();
  });

  app.get("/api/rules/bind", async () => {
    return service.bindRules();
  });

  app.get("/api/sync/report", async (request) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    return service.buildSyncReport(projectId || undefined);
  });

  app.get("/api/trace", async (request) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    return service.buildTraceReport(projectId || undefined);
  });

  app.get("/api/trace/map", async (request) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    return service.buildTraceReport(projectId || undefined);
  });

  const roadmapPaths = [
    "/api/roadmap-v0-1",
    "/api/roadmap-v0-2",
    "/api/roadmap-v0-3",
    "/api/roadmap-v0-4",
    "/api/roadmap-v0-5",
    "/api/roadmap-v0-6",
    "/api/roadmap-v0-7",
    "/api/roadmap-v0-8",
    "/api/roadmap-v0-9",
    "/api/roadmap-v1-0",
    "/api/roadmap-v1-1",
    "/api/roadmap-v1-2"
  ] as const;

  for (const path of roadmapPaths) {
    app.get(path, async (_request, reply) => {
      const roadmap = service.describeRoadmap(path);
      if (!roadmap) {
        reply.code(404);
        return { message: "roadmap not found" };
      }
      return roadmap;
    });
  }

  app.get("/api/roadmaps", async () => {
    return roadmapPaths
      .map((path) => service.describeRoadmap(path))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  });

  const apis: ModelApi[] = service.listRoutes();
  const reserved = new Set([
    "/api/model",
    "/api/model/entities",
    "/api/model/relations",
    "/api/rules/compile",
    "/api/rules/bind",
    "/api/sync/report",
    "/api/trace",
    "/api/trace/map"
  ]);

  for (const api of apis) {
    const path = typeof api.path === "string" ? api.path : "";
    if (!path) {
      continue;
    }
    const method = normalizeMethod(api.method ?? "GET");
    // Keep core workspace routes authoritative.
    if (reserved.has(path) || isCoreWorkspacePath(path) || isCorePlatformPath(path)) {
      continue;
    }
    const key = `${method} ${path}`;
    if (app.hasRoute({ method, url: path })) {
      continue;
    }
    app.route({
      method,
      url: path,
      handler: async () => {
        if (method === "GET" && path.startsWith("/api/roadmap-v")) {
          const roadmap = service.describeRoadmap(path);
          if (roadmap) {
            return roadmap;
          }
        }
        return { ok: true, route: key };
      }
    });
  }
  // AUTOboot:APIS:END
}
