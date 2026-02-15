import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";

function parsePositiveInt(value: string | undefined) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export async function registerPlatformRoutes(app: FastifyInstance, service: PlatformService) {
  app.get("/api/collab/snapshots", async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    return service.listVersionSnapshots(projectId);
  });

  app.post("/api/collab/snapshots", async (request, reply) => {
    const body = request.body as { projectId?: number; iterationId?: number; name?: string; note?: string } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const iterationId = typeof body?.iterationId === "number" ? body.iterationId : null;
    const name = body?.name?.trim();
    if (!projectId || !iterationId || !name) {
      reply.code(400);
      return { message: "projectId, iterationId and name are required" };
    }
    const created = service.createVersionSnapshot(projectId, iterationId, name, body?.note?.trim() || "");
    if (!created) {
      reply.code(404);
      return { message: "project or iteration not found" };
    }
    return created;
  });

  app.post("/api/collab/snapshots/:id/restore", async (request, reply) => {
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

  app.get("/api/collab/shares", async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId);
    if (projectId === null) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    return service.listProjectShares(projectId);
  });

  app.post("/api/collab/shares", async (request, reply) => {
    const body = request.body as { projectId?: number; permission?: "read" | "comment"; ttlHours?: number } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId || !body?.permission) {
      reply.code(400);
      return { message: "projectId and permission are required" };
    }
    const ttlHours = typeof body.ttlHours === "number" && body.ttlHours > 0 ? Math.floor(body.ttlHours) : 72;
    const created = service.createProjectShare(projectId, body.permission, ttlHours);
    if (!created) {
      reply.code(404);
      return { message: "project not found" };
    }
    return created;
  });

  app.get("/api/templates", async () => {
    return service.listTemplates();
  });

  app.post("/api/templates/:id/run", async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { projectId?: number } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId) {
      reply.code(400);
      return { message: "projectId is required" };
    }
    const result = service.runTemplate(params.id, projectId);
    if (!result) {
      reply.code(404);
      return { message: "template or project not found" };
    }
    return result;
  });

  app.get("/api/openapi/export", async () => {
    return service.exportOpenApi();
  });

  app.get("/api/ops/deployments", async (request) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    return service.listDeployments(projectId || undefined);
  });

  app.post("/api/ops/deployments", async (request, reply) => {
    const body = request.body as {
      projectId?: number;
      environment?: "staging" | "production";
      version?: string;
    } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const environment = body?.environment;
    const version = body?.version?.trim();
    if (!projectId || !environment || !version) {
      reply.code(400);
      return { message: "projectId, environment and version are required" };
    }
    if (!["staging", "production"].includes(environment)) {
      reply.code(400);
      return { message: "invalid environment" };
    }
    const created = service.createDeployment(projectId, environment, version);
    if (!created) {
      reply.code(404);
      return { message: "project not found" };
    }
    return created;
  });

  app.get("/api/ops/metrics", async () => {
    return service.getOpsMetrics();
  });
}
