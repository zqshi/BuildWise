import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AssessmentPayload,
  CreateIterationInput,
  Iteration,
  IterationContextPayload,
  IterationStatus,
  IterationTransitionSource
} from '../../../domain/workspace/types';
import {
  createIterationOp,
  createMessageOp,
  getAssessmentOp,
  getIterationContextOp,
  getStateMachineOp,
  listAssessmentSnapshotsOp,
  listIterationsOp,
  listMessagesOp,
  locateIterationsByCodeRefOp
} from './flowOps';
import { recomputeAssessmentOp, restoreSnapshotOp, transitionIterationWithMetaOp } from './assessmentOps';
import { writeAuditLog } from '../shared/common';
import { getIterationAccessContext } from '../shared/tenantAccess';

export class IterationService {
  constructor(
    private readonly repo: WorkspaceRepository,
    _agentRunner: unknown = null
  ) {}

  findIteration(iterationId: number) {
    return this.repo.findIteration(iterationId);
  }

  getIterationAccess(userId: string, iterationId: number) {
    return getIterationAccessContext(this.repo, iterationId, userId);
  }

  listIterations(projectId: number) {
    return listIterationsOp(this.repo, projectId);
  }

  createIteration(projectId: number, payload: CreateIterationInput) {
    return createIterationOp(this.repo, projectId, payload);
  }

  listMessages(iterationId: number, opts?: { limit?: number; offset?: number }) {
    return listMessagesOp(this.repo, iterationId, opts);
  }

  createMessage(iterationId: number, role: "system" | "assistant" | "user", content: string) {
    return createMessageOp(this.repo, iterationId, role, content);
  }

  getIterationContext(iterationId: number): IterationContextPayload | null {
    return getIterationContextOp(this.repo, iterationId);
  }

  getAssessment(iterationId: number): AssessmentPayload | null {
    return getAssessmentOp(this.repo, iterationId);
  }

  listAssessmentSnapshots(iterationId: number) {
    return listAssessmentSnapshotsOp(this.repo, iterationId);
  }

  getStateMachine(iterationId: number) {
    return getStateMachineOp(this.repo, iterationId);
  }

  transitionIteration(
    iterationId: number,
    toStatus: IterationStatus,
    input: {
      source: IterationTransitionSource;
      reason: string;
      operator: string;
      operatorRole: string;
    }
  ) {
    return transitionIterationWithMetaOp(this.repo, iterationId, toStatus, input);
  }

  recomputeAssessment(iterationId: number): AssessmentPayload | null {
    return recomputeAssessmentOp(this.repo, iterationId);
  }

  restoreSnapshot(iterationId: number, snapshotId: number): AssessmentPayload | null {
    return restoreSnapshotOp(this.repo, iterationId, snapshotId);
  }

  locateIterationsByCodeRef(projectId: number, ref: string) {
    return locateIterationsByCodeRefOp(this.repo, projectId, ref);
  }

  hasIterationData(iterationId: number): boolean {
    const messages = this.repo.listMessages(iterationId);
    if (messages.length > 0) return true;
    const transitions = this.repo.listTransitions(iterationId);
    return transitions.length > 0;
  }

  deleteIteration(iterationId: number): { deleted: boolean; reason?: string } {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) return { deleted: false, reason: "not_found" };
    if (this.hasIterationData(iterationId)) {
      return { deleted: false, reason: "iteration_has_data" };
    }
    this.repo.deleteIteration(iterationId);
    writeAuditLog(this.repo, "iteration_deleted", `iteration:${iterationId}`, `version=${iteration.version || iteration.name}`);
    return { deleted: true };
  }

  updateIterationInteractionState(
    iterationId: number,
    input: {
      hasPrototypeAssets: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    }
  ): Iteration | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const now = new Date().toISOString();
    const normalized: Iteration = {
      ...iteration,
      interactionState: {
        ...(iteration.interactionState || {}),
        hasPrototypeAssets: Boolean(input.hasPrototypeAssets),
        uploadKind: input.uploadKind || iteration.interactionState?.uploadKind || "other",
        lastUpdatedAt: now,
        lastAttachmentName: (input.lastAttachmentName || "").trim() || iteration.interactionState?.lastAttachmentName || ""
      }
    };
    this.repo.updateIteration(normalized);
    writeAuditLog(
      this.repo,
      "iteration_interaction_state_updated",
      `iteration:${iterationId}`,
      `hasPrototypeAssets=${normalized.interactionState?.hasPrototypeAssets ? "yes" : "no"};uploadKind=${normalized.interactionState?.uploadKind}`
    );
    return normalized;
  }
}
