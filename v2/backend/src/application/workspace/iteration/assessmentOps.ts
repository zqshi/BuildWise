import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AssessmentPayload, IterationStatus, IterationTransitionSource } from '../../../domain/workspace/types';
import { writeAuditLog } from '../shared/common';
import { normalizeIteration, recomputeAssessment, canTransitionTo } from '../shared/workspaceSupport';

export function transitionIterationWithMetaOp(
  repo: WorkspaceRepository,
  iterationId: number,
  toStatus: IterationStatus,
  input: {
    source: IterationTransitionSource;
    reason: string;
    operator: string;
    operatorRole: string;
  }
): { ok: true; data: { iterationId: number; fromStatus: IterationStatus; toStatus: IterationStatus; source: IterationTransitionSource; reason: string } } | { ok: false; reason: string } {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false, reason: "iteration_not_found" };
  }
  const source = input.source;
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, reason: "reason_required" };
  }
  if (source === "manual" && reason.length < 10) {
    return { ok: false, reason: "reason_too_short" };
  }
  const normalized = normalizeIteration(iteration);
  const fromStatus = normalized.status;
  if (fromStatus === toStatus) {
    return { ok: true, data: { iterationId, fromStatus, toStatus, source, reason } };
  }
  if (!canTransitionTo(fromStatus, toStatus)) {
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
    note: reason,
    reason,
    source,
    operator: input.operator,
    operatorRole: input.operatorRole,
    createdAt
  });
  writeAuditLog(
    repo,
    "iteration_state_transitioned",
    `iteration:${iterationId}`,
    `${fromStatus} -> ${toStatus} [source=${source}] [role=${input.operatorRole}] ${reason}`
  );
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
  return { ok: true, data: { iterationId, fromStatus, toStatus, source, reason } };
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
