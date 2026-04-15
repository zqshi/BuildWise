import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

export function registerOpsTriageRoutes(
  app: FastifyInstance,
  service: PlatformService,
  workspaceService: WorkspaceService,
  ensurePermission: EnsurePermission
) {
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
      return { message: "请提供项目 ID" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
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
      return { message: "没有权限" };
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
        return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
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
      return { message: "无效的模板数据" };
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
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const templateId = params.id?.trim();
    if (!templateId) {
      reply.code(400);
      return { message: "请提供模板 ID" };
    }
    const result = service.deleteOpsTriageTemplate(templateId);
    if (!result.ok) {
      reply.code(404);
      return { message: "模板不存在" };
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
      return { message: "没有权限" };
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
      return { message: "请提供项目 ID 和标题" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
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
