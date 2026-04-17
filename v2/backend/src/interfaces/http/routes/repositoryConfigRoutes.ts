import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

type IdParams = { id: string };

function resolveProjectId(request: FastifyRequest, reply: FastifyReply, service: WorkspaceService, level: "read" | "write" | "admin") {
  const projectId = parsePositiveInt((request.params as IdParams).id);
  if (projectId === null) { reply.code(400); return null; }
  const access = ensureProjectAccess(service, request, reply, projectId, level);
  if (!access) return null;
  return projectId;
}

const ID_PARAM_SCHEMA = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id"] as const
};

async function handleGetRepository(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "read");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const repo = service.project.getProjectRepository(projectId);
  if (!repo) { reply.code(404); return { message: "项目不存在" }; }
  return repo;
}

async function handleBootstrapRepository(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "write");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const body = request.body as {
    provider?: "github" | "gitlab" | "gitea" | "bitbucket" | "custom";
    organization?: string; name?: string; url?: string; defaultBranch?: string;
    repoMode?: "external_git" | "managed_local" | "hybrid";
    requireRemoteForProduction?: boolean; requireRemoteForStaging?: boolean;
  } | null;
  const result = service.project.bootstrapProjectRepository(projectId, {
    provider: body?.provider, organization: body?.organization, name: body?.name,
    url: body?.url, defaultBranch: body?.defaultBranch, repoMode: body?.repoMode,
    requireRemoteForProduction: body?.requireRemoteForProduction, requireRemoteForStaging: body?.requireRemoteForStaging,
  });
  if (!result.ok) {
    if (result.reason === "project_not_found" || result.reason === "repository_not_found") { reply.code(404); return { message: "项目不存在" }; }
    if (result.reason === "remote_validation_failed") { reply.code(400); return { message: result.message || "仓库远程地址校验失败" }; }
    reply.code(400); return { message: "仓库引导失败" };
  }
  return result.data;
}

async function handleValidateRepository(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "write");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const body = request.body as { url?: string } | null;
  const result = service.project.validateProjectRepositoryRemote(projectId, { url: body?.url });
  if (!result.ok) {
    if (result.reason === "project_not_found" || result.reason === "repository_not_found") { reply.code(404); return { message: "项目不存在" }; }
    if (result.reason === "remote_validation_failed") { reply.code(400); return { message: result.message || "仓库远程地址校验失败", checkedAt: result.checkedAt || "" }; }
    reply.code(400); return { message: "仓库远程地址校验失败" };
  }
  return result.data;
}

async function handleGetRepositoryStatus(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "read");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const status = service.project.getProjectRepositoryStatus(projectId);
  if (!status) { reply.code(404); return { message: "项目不存在" }; }
  return status;
}

async function handleGetMigrationPlan(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "read");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const plan = service.project.getProjectRepositoryMigrationPlan(projectId);
  if (!plan) { reply.code(404); return { message: "项目不存在" }; }
  return plan;
}

async function handleConfigureMode(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = resolveProjectId(request, reply, service, "admin");
  if (!projectId) return { message: reply.statusCode === 404 ? "项目不存在" : (reply.statusCode === 400 ? "无效的项目 ID" : "没有权限") };
  const body = request.body as {
    repoMode?: "external_git" | "managed_local" | "hybrid";
    requireRemoteForProduction?: boolean; requireRemoteForStaging?: boolean;
  } | null;
  const configured = service.project.configureProjectRepositoryMode(projectId, {
    repoMode: body?.repoMode, requireRemoteForProduction: body?.requireRemoteForProduction, requireRemoteForStaging: body?.requireRemoteForStaging,
  });
  if (!configured) { reply.code(404); return { message: "项目不存在" }; }
  return configured;
}

export function registerRepositoryConfigRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/repository", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleGetRepository(service, req, rep));

  app.post("/projects/:id/repository/bootstrap", {
    schema: { params: ID_PARAM_SCHEMA, body: { type: "object", properties: {
      provider: { type: "string", enum: ["github", "gitlab", "gitea", "bitbucket", "custom"] },
      organization: { type: "string" }, name: { type: "string" }, url: { type: "string" },
      defaultBranch: { type: "string" }, repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
      requireRemoteForProduction: { type: "boolean" }, requireRemoteForStaging: { type: "boolean" },
    }, additionalProperties: false } }
  }, (req, rep) => handleBootstrapRepository(service, req, rep));

  app.post("/projects/:id/repository/validate", {
    schema: { params: ID_PARAM_SCHEMA, body: { type: "object", properties: { url: { type: "string" } }, additionalProperties: false } }
  }, (req, rep) => handleValidateRepository(service, req, rep));

  app.get("/projects/:id/repository/status", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleGetRepositoryStatus(service, req, rep));

  app.get("/projects/:id/repository/migration-plan", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleGetMigrationPlan(service, req, rep));

  app.post("/projects/:id/repository/mode", {
    schema: { params: ID_PARAM_SCHEMA, body: { type: "object", properties: {
      repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
      requireRemoteForProduction: { type: "boolean" }, requireRemoteForStaging: { type: "boolean" },
    }, additionalProperties: false } }
  }, (req, rep) => handleConfigureMode(service, req, rep));
}
