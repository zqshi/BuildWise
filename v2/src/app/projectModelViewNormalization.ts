import type { ProjectModelViewPayload } from "../domain/workspace/modelOpsTypes.ts";
import { ensureArray } from "../shared/ensureArray.ts";

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeProjectModelViewPayload(value: unknown): ProjectModelViewPayload {
  const payload = ensureObject(value);
  return {
    projectName: typeof payload.projectName === "string" ? payload.projectName : undefined,
    iterationName: typeof payload.iterationName === "string" ? payload.iterationName : undefined,
    iterationStatus: typeof payload.iterationStatus === "string" ? payload.iterationStatus : undefined,
    entities: ensureArray<Record<string, unknown>>(payload.entities).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      businessName: typeof item.businessName === "string" ? item.businessName : typeof item.name === "string" ? item.name : "",
      fields: ensureArray<Record<string, unknown>>(item.fields).map((field) => ({
        name: typeof field.name === "string" ? field.name : "",
        type: typeof field.type === "string" ? field.type : "unknown",
        required: Boolean(field.required)
      }))
    })),
    relations: ensureArray<Record<string, unknown>>(payload.relations).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      fromEntityId: typeof item.fromEntityId === "string" ? item.fromEntityId : "",
      toEntityId: typeof item.toEntityId === "string" ? item.toEntityId : "",
      type:
        item.type === "one_to_one" || item.type === "many_to_many"
          ? item.type
          : "one_to_many",
      businessMeaning: typeof item.businessMeaning === "string" ? item.businessMeaning : undefined
    })),
    rules: ensureArray<Record<string, unknown>>(payload.rules).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      statement: typeof item.statement === "string" ? item.statement : undefined,
      source: item.source === "project_knowledge" ? "project_knowledge" : "snapshot",
      linkedEntityIds: ensureArray<string>(item.linkedEntityIds).filter((entry) => typeof entry === "string"),
      linkedSurfaceIds: ensureArray<string>(item.linkedSurfaceIds).filter((entry) => typeof entry === "string"),
      linkedApiIds: ensureArray<string>(item.linkedApiIds).filter((entry) => typeof entry === "string")
    })),
    reviewTasks: ensureArray<Record<string, unknown>>(payload.reviewTasks).map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      blocking: Boolean(item.blocking)
    })),
    ontologyTerms: ensureArray<Record<string, unknown>>(payload.ontologyTerms).map((item) => ({
      businessTerm: typeof item.businessTerm === "string" ? item.businessTerm : "",
      aliases: ensureArray<string>(item.aliases).filter((entry) => typeof entry === "string"),
      technicalAliases: ensureArray<string>(item.technicalAliases).filter((entry) => typeof entry === "string"),
      definition: typeof item.definition === "string" ? item.definition : "",
      source: item.source === "project_knowledge" ? "project_knowledge" : "snapshot"
    })),
    evidence: ensureArray<string>(payload.evidence).filter((entry) => typeof entry === "string"),
    latestSnapshotId: typeof payload.latestSnapshotId === "string" ? payload.latestSnapshotId : null,
    latestSnapshotStatus:
      payload.latestSnapshotStatus === "candidate" ||
      payload.latestSnapshotStatus === "published" ||
      payload.latestSnapshotStatus === "superseded"
        ? payload.latestSnapshotStatus
        : "none"
  };
}
