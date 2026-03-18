import type { FastifyInstance } from "fastify";
import type { ContinuousModelingWorkspaceService } from "../../../application/continuousModeling/continuousModelingWorkspaceService";
import type {
  BusinessEntity,
  BusinessRelation,
  BusinessRule,
  IterationModelingInput,
  ModelSnapshot,
  OntologyTerm,
  ReviewTask
} from "../../../domain/continuousModeling/types";
import { currentRole, isAdmin, parsePositiveInt } from "./workspaceRouteUtils";

function asTextArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function asOntologyTerms(value: unknown): OntologyTerm[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      canonicalTerm: String(item.canonicalTerm || "").trim(),
      aliases: asTextArray(item.aliases),
      technicalAliases: asTextArray(item.technicalAliases),
      definition: String(item.definition || "").trim(),
      evidence: asTextArray(item.evidence)
    }))
    .filter((item) => item.canonicalTerm);
}

function asEntities(value: unknown): BusinessEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: String(item.id || "").trim(),
      name: String(item.name || "").trim(),
      businessName: String(item.businessName || "").trim(),
      fields: Array.isArray(item.fields)
        ? item.fields
            .map((field) => field as Record<string, unknown>)
            .map((field) => ({
              name: String(field.name || "").trim(),
              type: String(field.type || "").trim(),
              required: Boolean(field.required)
            }))
            .filter((field) => field.name && field.type)
        : []
    }))
    .filter((item) => item.id && item.name && item.businessName);
}

function asRelations(value: unknown): BusinessRelation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const rawType = item.type;
      const type: BusinessRelation["type"] =
        rawType === "one_to_one" || rawType === "many_to_many" || rawType === "one_to_many"
          ? rawType
          : "one_to_many";
      return {
        id: String(item.id || "").trim(),
        fromEntityId: String(item.fromEntityId || "").trim(),
        toEntityId: String(item.toEntityId || "").trim(),
        type,
        businessMeaning: String(item.businessMeaning || "").trim()
      };
    })
    .filter((item) => item.id && item.fromEntityId && item.toEntityId && item.businessMeaning);
}

function asRules(value: unknown): BusinessRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: String(item.id || "").trim(),
      name: String(item.name || "").trim(),
      statement: String(item.statement || "").trim(),
      linkedEntityIds: asTextArray(item.linkedEntityIds),
      linkedSurfaceIds: asTextArray(item.linkedSurfaceIds),
      linkedApiIds: asTextArray(item.linkedApiIds)
    }))
    .filter((item) => item.id && item.name && item.statement);
}

function asBaselineSnapshot(value: unknown): ModelSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Record<string, unknown>;
  const projectId = parsePositiveInt(String(item.projectId || ""));
  const iterationId = parsePositiveInt(String(item.iterationId || ""));
  const status = String(item.status || "").trim();
  if (projectId === null || !item.id || !item.version || !status) {
    return null;
  }
  const asReviewTaskType = (raw: unknown): ReviewTask["type"] =>
    raw === "entity_confirmation" || raw === "rule_confirmation" || raw === "conflict_resolution" ? raw : "term_confirmation";
  return {
    id: String(item.id || "").trim(),
    projectId,
    iterationId,
    version: String(item.version || "").trim(),
    status: status === "published" || status === "superseded" ? status : "candidate",
    ontologyTerms: asOntologyTerms(item.ontologyTerms),
    entities: asEntities(item.entities),
    relations: asRelations(item.relations),
    rules: asRules(item.rules),
    reviewTasks: Array.isArray(item.reviewTasks)
      ? item.reviewTasks
          .map((task) => task as Record<string, unknown>)
          .map((task) => ({
            id: String(task.id || "").trim(),
            type: asReviewTaskType(task.type),
            title: String(task.title || "").trim(),
            description: String(task.description || "").trim(),
            blocking: Boolean(task.blocking)
          }))
          .filter((task) => task.id && task.title)
      : [],
    derivedFromSnapshotId: typeof item.derivedFromSnapshotId === "string" ? item.derivedFromSnapshotId : null,
    createdAt: String(item.createdAt || "").trim() || new Date().toISOString()
  };
}

function parseInput(body: Record<string, unknown>): IterationModelingInput | null {
  const projectId = parsePositiveInt(String(body.projectId || ""));
  const iterationId = parsePositiveInt(String(body.iterationId || ""));
  if (projectId === null || iterationId === null) {
    return null;
  }
  return {
    projectId,
    iterationId,
    baselineSnapshot: asBaselineSnapshot(body.baselineSnapshot),
    businessInputs: asTextArray(body.businessInputs),
    ontologyTerms: asOntologyTerms(body.ontologyTerms),
    entities: asEntities(body.entities),
    relations: asRelations(body.relations),
    rules: asRules(body.rules)
  };
}

export async function registerContinuousModelingRoutes(app: FastifyInstance, service: ContinuousModelingWorkspaceService) {
  app.get("/api/projects/:id/model-snapshots", async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const snapshots = service.listSnapshots(projectId);
    if (!snapshots) {
      reply.code(404);
      return { message: "project not found" };
    }
    return snapshots;
  });

  app.post("/api/projects/:id/model-snapshots/plan", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const parsed = parseInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "projectId and iterationId are required" };
    }
    const planned = service.planIterationModeling(parsed);
    if (!planned.ok) {
      reply.code(planned.reason === "project_not_found" ? 404 : 404);
      return { message: planned.reason === "project_not_found" ? "project not found" : "iteration not found" };
    }
    const plan = planned.data;
    return {
      summary: plan.summary,
      changedTerms: plan.changedTerms,
      changedEntities: plan.changedEntities,
      changedRules: plan.changedRules,
      blockingReviewTasks: plan.blockingReviewTasks,
      candidateSnapshot: plan.candidateSnapshot
    };
  });

  app.post("/api/projects/:id/model-snapshots/candidate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const parsed = parseInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "projectId and iterationId are required" };
    }
    const saved = service.saveCandidate(parsed);
    if (!saved.ok) {
      reply.code(saved.reason === "project_not_found" ? 404 : 404);
      return { message: saved.reason === "project_not_found" ? "project not found" : "iteration not found" };
    }
    return saved.data;
  });

  app.post("/api/projects/:id/model-snapshots/:snapshotId/publish", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id?: string; snapshotId?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const snapshotId = (params.snapshotId || "").trim();
    if (!snapshotId) {
      reply.code(400);
      return { message: "invalid snapshot id" };
    }
    const result = service.publishSnapshot(snapshotId, projectId);
    if (!result.ok) {
      const status = result.reason === "project_not_found" ? 404 : result.reason === "snapshot_not_found" ? 404 : 409;
      reply.code(status);
      return { message: result.reason };
    }
    return result;
  });

  app.get("/api/projects/:id/model-view", async (request, reply) => {
    const params = request.params as { id?: string };
    const query = request.query as { iterationId?: string } | undefined;
    const projectId = parsePositiveInt(params.id);
    const iterationId = parsePositiveInt(query?.iterationId);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    if (query?.iterationId && iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const view = service.getProjectModelView(projectId, iterationId ?? undefined);
    if (!view) {
      reply.code(404);
      return { message: iterationId ? "project or iteration not found" : "project not found" };
    }
    return view;
  });
}
