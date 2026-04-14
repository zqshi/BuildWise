import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AttachmentUploadInput } from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';

export function isDuplicateAttachmentUploadOp(repo: WorkspaceRepository, iterationId: number, inputFingerprint: string) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return false;
  }
  const latestFingerprint = iteration.changeControl?.lastUploadedInputFingerprint?.trim() || "";
  return Boolean(latestFingerprint && latestFingerprint === inputFingerprint);
}

export function hasPendingDuplicateJobOp<T extends { iterationId: number; status: string; inputFingerprint: string }>(
  jobs: Iterable<T>,
  iterationId: number,
  inputFingerprint: string
) {
  for (const job of jobs) {
    if (job.iterationId !== iterationId) {
      continue;
    }
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    if (job.inputFingerprint === inputFingerprint) {
      return true;
    }
  }
  return false;
}

export function findPendingDuplicateJobOp<T extends { iterationId: number; status: string; inputFingerprint: string }>(
  jobs: Iterable<T>,
  iterationId: number,
  inputFingerprint: string
): T | null {
  for (const job of jobs) {
    if (job.iterationId !== iterationId) {
      continue;
    }
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    if (job.inputFingerprint === inputFingerprint) {
      return job;
    }
  }
  return null;
}

export function recordAttachmentInputFingerprintOp(
  repo: WorkspaceRepository,
  iterationId: number,
  inputFingerprint: string,
  at = new Date().toISOString()
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return;
  }
  iteration.changeControl = {
    ...(iteration.changeControl || defaultIterationChangeControl()),
    lastUploadedInputFingerprint: inputFingerprint,
    lastUploadedAt: at
  };
  repo.updateIteration(iteration);
}

export function persistRetryableAnalysisInputOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: AttachmentUploadInput,
  at = new Date().toISOString()
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return;
  }
  iteration.changeControl = {
    ...(iteration.changeControl || defaultIterationChangeControl()),
    lastFailedAnalysisInput: JSON.stringify(input),
    lastFailedAnalysisAt: at,
    lastFailedAnalysisError: ""
  };
  repo.updateIteration(iteration);
}

export function markFailedAnalysisOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: AttachmentUploadInput,
  errorMessage: string,
  at = new Date().toISOString()
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return;
  }
  iteration.changeControl = {
    ...(iteration.changeControl || defaultIterationChangeControl()),
    lastFailedAnalysisInput: JSON.stringify(input),
    lastFailedAnalysisAt: at,
    lastFailedAnalysisError: errorMessage
  };
  repo.updateIteration(iteration);
}
