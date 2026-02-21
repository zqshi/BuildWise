import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AssessmentPayload, AssessmentSnapshot, CreateIterationInput, Iteration, IterationCodeLink, IterationContextPayload, IterationStatus } from "../../domain/workspace/types";
import { buildMergedIterationPayload, normalizeIteration, normalizeProject, recomputeAssessment, statusTransitions } from "./workspaceSupport";
import { buildDefaultIterationCodeLink, hasProject, writeAuditLog } from "./workspaceServiceCommon";

export function listIterationsOp(repo: WorkspaceRepository, projectId: number) {
  if (!hasProject(repo, projectId)) {
    return null;
  }
  return repo.listIterations(projectId).map(normalizeIteration);
}

export function createIterationOp(repo: WorkspaceRepository, projectId: number, payload: CreateIterationInput) {
  if (!hasProject(repo, projectId)) {
    return null;
  }
  const project = repo.findProject(projectId);
  const previous = repo.listIterations(projectId).sort((a, b) => b.id - a.id).map(normalizeIteration)[0] ?? null;
  const mergedPayload = buildMergedIterationPayload(payload, project, previous);
  const created = repo.createIteration(projectId, mergedPayload);
  const normalized = normalizeIteration(created);
  if (!normalized.codeLink) {
    const defaultCodeLink = buildDefaultIterationCodeLink(repo, normalized);
    if (defaultCodeLink) {
      normalized.codeLink = defaultCodeLink;
      repo.updateIteration(normalized);
      writeAuditLog(repo, "iteration_code_link_initialized", `iteration:${normalized.id}`, `${defaultCodeLink.branch}@${defaultCodeLink.commit || "HEAD"}`);
    }
  }
  const snapshot: AssessmentSnapshot = {
    id: repo.nextId(repo.read().snapshots),
    iterationId: normalized.id,
    source: "create",
    note: "迭代创建自动快照",
    assessment: normalized.assessment,
    scope: normalized.scope,
    status: normalized.status,
    progress: normalized.progress,
    createdAt: new Date().toISOString()
  };
  repo.appendSnapshot(snapshot);
  return normalized;
}

export function listMessagesOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listMessages(iterationId);
}

export function createMessageOp(repo: WorkspaceRepository, iterationId: number, role: "system" | "assistant" | "user", content: string) {
  const created = repo.createMessage(iterationId, role, content);
  const iteration = repo.findIteration(iterationId);
  if (iteration) {
    const snapshot: AssessmentSnapshot = {
      id: repo.nextId(repo.read().snapshots),
      iterationId,
      source: "message",
      note: `${role} 消息更新`,
      assessment: iteration.assessment,
      scope: iteration.scope,
      status: iteration.status,
      progress: iteration.progress,
      createdAt: new Date().toISOString()
    };
    repo.appendSnapshot(snapshot);
  }
  return created;
}

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
    allowedTransitions: statusTransitions[currentStatus] || [],
    transitionHistory: repo.listTransitions(iterationId)
  };
}

export function transitionIterationOp(repo: WorkspaceRepository, iterationId: number, toStatus: IterationStatus, note = ""):
  { ok: true; data: { iterationId: number; fromStatus: IterationStatus; toStatus: IterationStatus } } | { ok: false; reason: string } {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false, reason: "iteration_not_found" };
  }
  const normalized = normalizeIteration(iteration);
  const fromStatus = normalized.status;
  if (fromStatus === toStatus) {
    return { ok: true, data: { iterationId, fromStatus, toStatus } };
  }
  const allowed = statusTransitions[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return { ok: false, reason: "invalid_transition" };
  }
  normalized.status = toStatus;
  if (toStatus === "completed") {
    normalized.progress = 100;
  } else if (toStatus === "in-progress" && normalized.progress === 0) {
    normalized.progress = 10;
  }
  repo.updateIteration(normalized);
  const createdAt = new Date().toISOString();
  repo.appendTransition({
    id: repo.nextId(repo.read().transitions),
    iterationId,
    fromStatus,
    toStatus,
    note: note || `${fromStatus} -> ${toStatus}`,
    createdAt
  });
  writeAuditLog(repo, "iteration_state_transitioned", `iteration:${iterationId}`, `${fromStatus} -> ${toStatus}${note ? ` (${note})` : ""}`);
  repo.appendSnapshot({
    id: repo.nextId(repo.read().snapshots),
    iterationId,
    source: "state-transition",
    note: `状态迁移 ${fromStatus} -> ${toStatus}`,
    assessment: normalized.assessment,
    scope: normalized.scope,
    status: normalized.status,
    progress: normalized.progress,
    createdAt
  });
  return { ok: true, data: { iterationId, fromStatus, toStatus } };
}

export function recomputeAssessmentOp(repo: WorkspaceRepository, iterationId: number): AssessmentPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const previous = repo.findPreviousIteration(iteration);
  const normalized = normalizeIteration(iteration);
  normalized.assessment = recomputeAssessment(normalized, previous ? normalizeIteration(previous) : null);
  repo.updateIteration(normalized);
  repo.appendSnapshot({
    id: repo.nextId(repo.read().snapshots),
    iterationId,
    source: "manual-recompute",
    note: "手动刷新评估",
    assessment: normalized.assessment,
    scope: normalized.scope,
    status: normalized.status,
    progress: normalized.progress,
    createdAt: new Date().toISOString()
  });
  writeAuditLog(repo, "assessment_recomputed", `iteration:${iterationId}`, "手动刷新评估");
  return {
    iterationId,
    iterationName: normalized.name,
    assessment: normalized.assessment
  };
}

export function restoreSnapshotOp(repo: WorkspaceRepository, iterationId: number, snapshotId: number): AssessmentPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const snapshot = repo.listSnapshots(iterationId).find((item) => item.id === snapshotId);
  if (!snapshot) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  normalized.assessment = snapshot.assessment;
  normalized.scope = snapshot.scope;
  normalized.status = snapshot.status;
  normalized.progress = snapshot.progress;
  repo.updateIteration(normalized);
  repo.appendSnapshot({
    id: repo.nextId(repo.read().snapshots),
    iterationId,
    source: "restore",
    note: `恢复快照 #${snapshotId}`,
    assessment: normalized.assessment,
    scope: normalized.scope,
    status: normalized.status,
    progress: normalized.progress,
    createdAt: new Date().toISOString()
  });
  writeAuditLog(repo, "assessment_restored", `iteration:${iterationId}`, `恢复快照 #${snapshotId}`);
  return {
    iterationId,
    iterationName: normalized.name,
    assessment: normalized.assessment
  };
}
