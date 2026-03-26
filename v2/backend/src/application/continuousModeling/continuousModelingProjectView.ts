import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { ModelSnapshot, ProjectModelView } from "../../domain/continuousModeling/types";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { normalizeIteration, normalizeProject } from "../workspace/workspaceSupport";

function uniq(items: string[], max = 8) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, max);
}

function latestSnapshotForIteration(snapshots: ModelSnapshot[], iterationId: number | null) {
  return (
    snapshots
      .filter((item) => (iterationId === null ? true : item.iterationId === iterationId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}

export function buildProjectModelView(
  workspaceRepo: WorkspaceRepository,
  modelingRepo: ContinuousModelingRepository | null,
  projectId: number,
  iterationId?: number
): ProjectModelView | null {
  const project = workspaceRepo.findProject(projectId);
  if (!project) {
    return null;
  }
  const normalizedProject = normalizeProject(project);
  const iteration =
    typeof iterationId === "number"
      ? workspaceRepo.findIteration(iterationId)
      : workspaceRepo.listIterations(projectId).sort((left, right) => right.id - left.id)[0] || null;
  if (iteration && iteration.projectId !== projectId) {
    return null;
  }
  const normalizedIteration = iteration ? normalizeIteration(iteration) : null;
  const snapshots = modelingRepo?.listSnapshots(projectId) || [];
  const latestSnapshot = latestSnapshotForIteration(snapshots, normalizedIteration?.id ?? null);
  const knowledge = normalizedProject.knowledgeBase;
  const knowledgeTerms =
    knowledge?.ontologyTerms.map((item) => ({
      businessTerm: item.term,
      aliases: item.aliases,
      technicalAliases: [] as string[],
      definition: item.definition,
      source: "project_knowledge" as const
    })) || [];
  const snapshotTerms =
    latestSnapshot?.ontologyTerms.map((item) => ({
      businessTerm: item.canonicalTerm,
      aliases: item.aliases,
      technicalAliases: item.technicalAliases,
      definition: item.definition,
      source: "snapshot" as const
    })) || [];
  const ontologyTerms: ProjectModelView["ontologyTerms"] = [...knowledgeTerms];
  for (const term of snapshotTerms) {
    if (!ontologyTerms.some((item) => item.businessTerm === term.businessTerm)) {
      ontologyTerms.push(term);
    }
  }
  const knowledgeRules =
    knowledge?.stableRules.map((item) => ({
      id: `kb-rule-${item.rule}`,
      name: item.rule,
      statement: item.rationale || item.rule,
      source: "project_knowledge" as const,
      linkedEntityIds: [] as string[],
      linkedSurfaceIds: [] as string[],
      linkedApiIds: [] as string[]
    })) || [];
  const snapshotRules =
    latestSnapshot?.rules.map((item) => ({
      id: item.id,
      name: item.name,
      statement: item.statement,
      source: "snapshot" as const,
      linkedEntityIds: item.linkedEntityIds,
      linkedSurfaceIds: item.linkedSurfaceIds,
      linkedApiIds: item.linkedApiIds
    })) || [];
  const rules: ProjectModelView["rules"] = [...knowledgeRules];
  for (const rule of snapshotRules) {
    if (!rules.some((item) => item.name === rule.name)) {
      rules.push(rule);
    }
  }
  return {
    projectId,
    projectName: normalizedProject.name,
    projectDescription: normalizedProject.description || "",
    iterationId: normalizedIteration?.id ?? null,
    iterationName: normalizedIteration?.name || "",
    iterationStatus: normalizedIteration?.status || "unknown",
    latestSnapshotId: latestSnapshot?.id || null,
    latestSnapshotStatus: latestSnapshot?.status || "none",
    ontologyTerms,
    rules,
    entities:
      latestSnapshot?.entities.map((item) => ({
        id: item.id,
        name: item.name,
        businessName: item.businessName,
        fields: item.fields
      })) || [],
    relations:
      latestSnapshot?.relations.map((item) => ({
        id: item.id,
        fromEntityId: item.fromEntityId,
        toEntityId: item.toEntityId,
        type: item.type,
        businessMeaning: item.businessMeaning
      })) || [],
    reviewTasks: latestSnapshot?.reviewTasks || [],
    evidence: uniq(
      [
        latestSnapshot ? `snapshot:${latestSnapshot.id}` : "",
        normalizedIteration ? `iteration:${normalizedIteration.id}` : "",
        ...(knowledge?.decisionLog.slice(0, 4).map((item) => `decision:${item.decision}`) || []),
        ...(knowledge?.knownRisks.slice(0, 4).map((item) => `risk:${item.risk}`) || [])
      ],
      10
    )
  };
}

export function summarizeProjectModelView(view: ProjectModelView | null) {
  if (!view) {
    return "[统一模型视图]\nproject=unknown\nsnapshot=none\nontologyTerms=-\nrules=-\nreviewTasks=-";
  }
  return [
    "[统一模型视图]",
    `project=${view.projectName}`,
    `description=${view.projectDescription || "-"}`,
    `iteration=${view.iterationName || "-"};status=${view.iterationStatus}`,
    `snapshot=${view.latestSnapshotId || "-"};snapshotStatus=${view.latestSnapshotStatus}`,
    `ontologyTerms=${view.ontologyTerms
      .slice(0, 8)
      .map((item) => `${item.businessTerm}${item.technicalAliases.length > 0 ? `(${item.technicalAliases.join("/")})` : ""}`)
      .join(" | ") || "-"}`,
    `rules=${view.rules.slice(0, 8).map((item) => item.name).join(" | ") || "-"}`,
    `entities=${view.entities.slice(0, 8).map((item) => `${item.businessName}/${item.name}`).join(" | ") || "-"}`,
    `reviewTasks=${view.reviewTasks.slice(0, 6).map((item) => item.title).join(" | ") || "-"}`,
    `evidence=${view.evidence.join(" | ") || "-"}`
  ].join("\n");
}

