import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AssessmentPayload,
  IterationCodeLink,
  IterationContextPayload
} from '../../../domain/workspace/types';
import { normalizeIteration, normalizeProject, allowedTransitionsFrom } from '../shared/workspaceSupport';
import { writeAuditLog } from '../shared/common';

export function bindIterationCodeLinkOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: Partial<Pick<IterationCodeLink, "branch" | "tag" | "commit" | "pr" | "paths" | "note">>
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const project = repo.findProject(iteration.projectId);
  const projectRepo = project ? normalizeProject(project).repository : null;
  if (!projectRepo) {
    return null;
  }
  const normalizedIteration = normalizeIteration(iteration);
  const slug = normalizedIteration.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `iter-${iterationId}`;
  const link: IterationCodeLink = {
    repoId: projectRepo.id,
    branch: input.branch?.trim() || `iteration/${iterationId}-${slug}`,
    tag: input.tag?.trim() || (normalizedIteration.version ? `v${normalizedIteration.version}` : `iter-v${iterationId}`),
    commit: input.commit?.trim() || "",
    pr: input.pr?.trim() || "",
    paths: Array.isArray(input.paths) ? input.paths.filter((item) => item.trim()).map((item) => item.trim()) : [],
    note: input.note?.trim() || "",
    linkedAt: new Date().toISOString()
  };
  normalizedIteration.codeLink = link;
  repo.updateIteration(normalizedIteration);
  writeAuditLog(repo, "iteration_code_linked", `iteration:${iterationId}`, `${link.branch}@${link.commit || "HEAD"}`);
  return link;
}

export function getIterationCodeLinkOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  return normalizeIteration(iteration).codeLink ?? null;
}

export function locateIterationsByCodeRefOp(repo: WorkspaceRepository, projectId: number, ref: string) {
  const query = ref.trim().toLowerCase();
  if (!query) {
    return [];
  }
  return repo
    .listIterations(projectId)
    .map(normalizeIteration)
    .filter((item) => {
      const link = item.codeLink;
      if (!link) {
        return false;
      }
      const fields = [link.branch, link.tag, link.commit, link.pr, ...link.paths].filter(Boolean).map((value) => value.toLowerCase());
      return fields.some((value) => value.includes(query));
    })
    .map((item) => ({
      iterationId: item.id,
      iterationName: item.name,
      status: item.status,
      codeLink: item.codeLink
    }));
}

export function getIterationContextOp(repo: WorkspaceRepository, iterationId: number): IterationContextPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  return {
    iteration: normalized,
    previous: previous ? normalizeIteration(previous) : null,
    continuity: normalized.continuity,
    scope: normalized.scope
  };
}

export function getAssessmentOp(repo: WorkspaceRepository, iterationId: number): AssessmentPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  return {
    iterationId: normalized.id,
    iterationName: normalized.name,
    assessment: normalized.assessment
  };
}

export function listAssessmentSnapshotsOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listSnapshots(iterationId);
}

export function getStateMachineOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const currentStatus = normalized.status;
  return {
    iterationId: normalized.id,
    currentStatus,
    allowedTransitions: allowedTransitionsFrom(currentStatus),
    transitionHistory: repo.listTransitions(iterationId).map((item) => ({
      ...item,
      note: item.note || item.reason || "",
      reason: item.reason || item.note || "",
      source: item.source || "manual",
      operator: item.operator || "unknown",
      operatorRole: item.operatorRole || "unknown"
    }))
  };
}
