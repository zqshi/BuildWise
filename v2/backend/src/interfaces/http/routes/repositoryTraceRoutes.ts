import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { ensureIterationAccess, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

export async function registerRepositoryTraceRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/repository", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const repo = service.getProjectRepository(projectId);
    if (!repo) {
      reply.code(404);
      return { message: "project not found" };
    }
    return repo;
  });

  app.post("/projects/:id/repository/bootstrap", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["github", "gitlab", "gitea", "bitbucket", "custom"] },
          organization: { type: "string" },
          name: { type: "string" },
          url: { type: "string" },
          defaultBranch: { type: "string" },
          repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
          requireRemoteForProduction: { type: "boolean" },
          requireRemoteForStaging: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      provider?: "github" | "gitlab" | "gitea" | "bitbucket" | "custom";
      organization?: string;
      name?: string;
      url?: string;
      defaultBranch?: string;
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    } | null;
    const repo = service.bootstrapProjectRepository(projectId, {
      provider: body?.provider,
      organization: body?.organization,
      name: body?.name,
      url: body?.url,
      defaultBranch: body?.defaultBranch,
      repoMode: body?.repoMode,
      requireRemoteForProduction: body?.requireRemoteForProduction,
      requireRemoteForStaging: body?.requireRemoteForStaging
    });
    if (!repo.ok) {
      if (repo.reason === "project_not_found" || repo.reason === "repository_not_found") {
        reply.code(404);
        return { message: "project not found" };
      }
      if (repo.reason === "remote_validation_failed") {
        reply.code(400);
        return { message: repo.message || "repository remote validation failed" };
      }
      reply.code(400);
      return { message: "repository bootstrap failed" };
    }
    return repo.data;
  });

  app.post("/projects/:id/repository/validate", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          url: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as { url?: string } | null;
    const result = service.validateProjectRepositoryRemote(projectId, { url: body?.url });
    if (!result.ok) {
      if (result.reason === "project_not_found" || result.reason === "repository_not_found") {
        reply.code(404);
        return { message: "project not found" };
      }
      if (result.reason === "remote_validation_failed") {
        reply.code(400);
        return { message: result.message || "repository remote validation failed", checkedAt: result.checkedAt || "" };
      }
      reply.code(400);
      return { message: "repository remote validation failed" };
    }
    return result.data;
  });

  app.get("/projects/:id/repository/status", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const status = service.getProjectRepositoryStatus(projectId);
    if (!status) {
      reply.code(404);
      return { message: "project not found" };
    }
    return status;
  });

  app.get("/projects/:id/repository/migration-plan", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const plan = service.getProjectRepositoryMigrationPlan(projectId);
    if (!plan) {
      reply.code(404);
      return { message: "project not found" };
    }
    return plan;
  });

  app.post("/projects/:id/repository/mode", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
          requireRemoteForProduction: { type: "boolean" },
          requireRemoteForStaging: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    } | null;
    const configured = service.configureProjectRepositoryMode(projectId, {
      repoMode: body?.repoMode,
      requireRemoteForProduction: body?.requireRemoteForProduction,
      requireRemoteForStaging: body?.requireRemoteForStaging
    });
    if (!configured) {
      reply.code(404);
      return { message: "project not found" };
    }
    return configured;
  });

  app.post("/projects/:id/repository/provision", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          ownerType: { type: "string", enum: ["org", "user"] },
          organization: { type: "string" },
          name: { type: "string" },
          defaultBranch: { type: "string" },
          visibility: { type: "string", enum: ["private", "public"] },
          autoInit: { type: "boolean" },
          dryRun: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      ownerType?: "org" | "user";
      organization?: string;
      name?: string;
      defaultBranch?: string;
      visibility?: "private" | "public";
      autoInit?: boolean;
      dryRun?: boolean;
    } | null;
    const result = await service.provisionProjectRepository(projectId, {
      ownerType: body?.ownerType,
      organization: body?.organization,
      name: body?.name,
      defaultBranch: body?.defaultBranch,
      visibility: body?.visibility,
      autoInit: body?.autoInit,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "project_not_found") {
        reply.code(404);
        return { message: "project not found" };
      }
      if (result.reason === "provider_not_supported") {
        reply.code(400);
        return { message: "provider not supported" };
      }
      reply.code(502);
      return { message: result.message || "repository provision failed" };
    }
    return result.data;
  });

  app.post("/projects/:id/repository/scaffold", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          rootDir: { type: "string" },
          initializeGit: { type: "boolean" },
          createInitialCommit: { type: "boolean" },
          dryRun: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      rootDir?: string;
      initializeGit?: boolean;
      createInitialCommit?: boolean;
      dryRun?: boolean;
    } | null;
    const result = service.scaffoldProjectRepository(projectId, {
      rootDir: body?.rootDir,
      initializeGit: body?.initializeGit,
      createInitialCommit: body?.createInitialCommit,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "project_not_found") {
        reply.code(404);
        return { message: "project not found" };
      }
      reply.code(500);
      return { message: "repository scaffold failed" };
    }
    return result.data;
  });

  app.post("/iterations/:id/publish", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          commitMessage: { type: "string" },
          openPr: { type: "boolean" },
          prTitle: { type: "string" },
          prBody: { type: "string" },
          dryRun: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as {
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    } | null;
    const result = await service.publishIterationToRemote(iterationId, {
      commitMessage: body?.commitMessage,
      openPr: body?.openPr,
      prTitle: body?.prTitle,
      prBody: body?.prBody,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (result.reason === "repository_not_scaffolded") {
        reply.code(409);
        return { message: "repository not scaffolded" };
      }
      if (result.reason === "analysis_confirmation_required") {
        reply.code(409);
        return { message: "analysis confirmation required" };
      }
      if (result.reason === "release_review_blocked") {
        reply.code(409);
        return { message: result.message || "release review blocked", blockers: result.blockers || [] };
      }
      if (result.reason === "boundary_violation") {
        reply.code(409);
        return { message: result.message || "boundary violation", blockers: result.blockers || [] };
      }
      if (result.reason === "remote_required_for_publish") {
        reply.code(409);
        return { message: result.message || "remote repository is required for publish" };
      }
      reply.code(502);
      return { message: result.message || "iteration publish failed" };
    }
    return result.data;
  });

  app.post("/iterations/:id/code-link", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          branch: { type: "string" },
          tag: { type: "string" },
          commit: { type: "string" },
          pr: { type: "string" },
          paths: { type: "array", items: { type: "string" } },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as {
      branch?: string;
      tag?: string;
      commit?: string;
      pr?: string;
      paths?: string[];
      note?: string;
    } | null;
    const linked = service.bindIterationCodeLink(iterationId, {
      branch: body?.branch,
      tag: body?.tag,
      commit: body?.commit,
      pr: body?.pr,
      paths: body?.paths,
      note: body?.note
    });
    if (!linked) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return linked;
  });

  app.get("/iterations/:id/code-link", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const codeLink = service.getIterationCodeLink(iterationId);
    if (!codeLink) {
      reply.code(404);
      return { message: "code link not found" };
    }
    return codeLink;
  });

  app.get("/projects/:id/code-trace", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      querystring: {
        type: "object",
        properties: {
          ref: { type: "string", minLength: 1 }
        },
        required: ["ref"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const query = request.query as { ref?: string } | null;
    const ref = query?.ref?.trim() || "";
    if (!ref) {
      reply.code(400);
      return { message: "ref is required" };
    }
    if (!service.hasProject(projectId)) {
      reply.code(404);
      return { message: "project not found" };
    }
    return {
      projectId,
      ref,
      matches: service.locateIterationsByCodeRef(projectId, ref)
    };
  });
}
