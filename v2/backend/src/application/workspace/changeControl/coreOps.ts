import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { ALLOWED_EXECUTION_STATUSES } from '../../../domain/workspace/iterationTypes';
import type { IterationChangeBoundary } from '../../../domain/workspace/types';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl, resolveClarificationSelection, writeAuditLog } from '../shared/common';
import { ensureArtifactWorkflow, markDownstreamStale, summarizeMatrixExecution, type TestMatrixExecutionUpdate } from './artifactWorkflow';
import { publishChangeImpactMessage } from './conversationPolicy';
import {
  mergeAcceptanceChecks,
  handleClarificationRequest,
  buildConfirmedChangeControl,
  updateAnalysisReportArtifact,
  persistKnowledgeBaseUpdate,
  publishReadyArtifactMessages,
  validateConfirmationPreconditions
} from './confirmAnalysisOps';
import { normalizeExecutionUpdates, applyMatrixUpdates } from './testMatrixExecutionOps';

export function getIterationChangeControlOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  // 纯读取：计算 workflow 视图但不写回数据库，避免并发覆盖
  return {
    ...current,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
}

export function confirmIterationAnalysisOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: {
    accurate: boolean;
    note?: string;
    actor?: string;
    force?: boolean;
    boundary?: Partial<IterationChangeBoundary>;
    resolvedClarificationQuestions?: string[];
  }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false as const, reason: "iteration_not_found" };
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const note = input.note?.trim() || "";
  const acceptanceChecks = mergeAcceptanceChecks(
    normalized.scope.acceptanceCriteria,
    current?.qualityArtifacts?.acceptanceChecklist || [],
    current?.executableConstraints?.acceptanceChecks || []
  );
  const resolution = resolveClarificationSelection(
    Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [],
    input.resolvedClarificationQuestions ??
      (Array.isArray(current?.clarificationDraftResolvedQuestions) ? current?.clarificationDraftResolvedQuestions : []),
    now
  );
  if (!input.accurate) {
    return handleClarificationRequest(repo, iterationId, normalized, current, resolution, note, now);
  }

  const preconditionResult = validateConfirmationPreconditions(current, resolution, input.force);
  if (!preconditionResult.ok) return preconditionResult;
  const effectiveResolution = preconditionResult.effectiveResolution;

  normalized.changeControl = buildConfirmedChangeControl(normalized, current, input, effectiveResolution, acceptanceChecks, note, now);
  updateAnalysisReportArtifact(repo, iterationId, normalized.changeControl, now);
  writeAuditLog(repo, "iteration_analysis_confirmed", `iteration:${iterationId}`, `confirmedBy=${normalized.changeControl.confirmedBy}`);

  persistKnowledgeBaseUpdate(repo, normalized);
  repo.updateIteration(normalized);
  publishReadyArtifactMessages(repo, iterationId, normalized.changeControl?.artifactWorkflow);
  return { ok: true as const, data: normalized.changeControl };
}

export function updateIterationBoundaryOp(repo: WorkspaceRepository, iterationId: number, input: Partial<IterationChangeBoundary>) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const acceptanceChecks = mergeAcceptanceChecks(
    normalized.scope.acceptanceCriteria,
    current?.qualityArtifacts?.acceptanceChecklist || [],
    current?.executableConstraints?.acceptanceChecks || []
  );
  normalized.changeControl = {
    ...current,
    boundary: {
      requirementRefs: Array.isArray(input.requirementRefs)
        ? input.requirementRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.requirementRefs || [],
      componentRefs: Array.isArray(input.componentRefs)
        ? input.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.componentRefs || [],
      codePaths: Array.isArray(input.codePaths)
        ? input.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.codePaths || [],
      note: input.note?.trim() || current?.boundary.note || "",
      updatedAt: now
    },
    executableConstraints: {
      componentWhitelist: Array.isArray(input.componentRefs)
        ? input.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.componentWhitelist || [],
      codePathWhitelist: Array.isArray(input.codePaths)
        ? input.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.codePathWhitelist || [],
      acceptanceChecks,
      generatedAt: now
    },
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  const boundaryItem = normalized.changeControl.artifactWorkflow.items.find((item) => item.id === "boundary-confirmation");
  if (boundaryItem) {
    boundaryItem.outputVersion += 1;
    boundaryItem.updatedAt = now;
    const staleAfterBoundary = markDownstreamStale(normalized.changeControl.artifactWorkflow.items, boundaryItem.id);
    if (staleAfterBoundary.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterBoundary);
  }
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_change_boundary_updated", `iteration:${iterationId}`, normalized.changeControl?.boundary.note || "updated");
  return normalized.changeControl ?? defaultIterationChangeControl();
}

export function updateClarificationDraftOp(repo: WorkspaceRepository, iterationId: number, resolvedQuestions: string[]) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const allowedQuestions = Array.isArray(current.clarificationQuestions) ? current.clarificationQuestions : [];
  const selected = Array.isArray(resolvedQuestions)
    ? resolvedQuestions.map((item) => item.trim()).filter((item) => item.length > 0)
    : [];
  const selectedSet = new Set(selected);
  const filtered = allowedQuestions.filter((item) => selectedSet.has(item));
  normalized.changeControl = {
    ...current,
    clarificationDraftResolvedQuestions: filtered,
    clarificationDraftUpdatedAt: now,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_clarification_draft_updated", `iteration:${iterationId}`, `resolved=${filtered.length};total=${allowedQuestions.length}`);
  return normalized.changeControl;
}

export function updateIterationTestMatrixExecutionOp(
  repo: WorkspaceRepository,
  iterationId: number,
  updates: TestMatrixExecutionUpdate[]
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return { ok: false as const, reason: "iteration_not_found" };
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const matrix = Array.isArray(current.generatedTestMatrix) ? current.generatedTestMatrix : [];
  if (matrix.length === 0) return { ok: false as const, reason: "test_matrix_missing" };

  const normalizedUpdates = normalizeExecutionUpdates(updates);
  if (normalizedUpdates.length === 0 || normalizedUpdates.some((item) => !ALLOWED_EXECUTION_STATUSES.has(item.status))) {
    return { ok: false as const, reason: "invalid_updates" };
  }
  const existingIds = new Set(matrix.map((item) => item.caseId).filter(Boolean));
  const missingCaseIds = normalizedUpdates.map((item) => item.caseId).filter((id, i, a) => a.indexOf(id) === i && !existingIds.has(id));
  if (missingCaseIds.length > 0) return { ok: false as const, reason: "case_not_found", missingCaseIds };

  const now = new Date().toISOString();
  const updatedMatrix = applyMatrixUpdates(matrix, normalizedUpdates, now);
  normalized.changeControl = {
    ...current, generatedTestMatrix: updatedMatrix, testMatrixExecutionUpdatedAt: now,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  const matrixItem = normalized.changeControl.artifactWorkflow.items.find((item) => item.id === "test-matrix");
  if (matrixItem) {
    matrixItem.outputVersion += 1;
    matrixItem.updatedAt = now;
    const staleAfterMatrix = markDownstreamStale(normalized.changeControl.artifactWorkflow.items, matrixItem.id);
    if (staleAfterMatrix.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterMatrix);
  }
  repo.updateIteration(normalized);

  const summary = summarizeMatrixExecution(updatedMatrix);
  writeAuditLog(repo, "iteration_test_matrix_execution_updated", `iteration:${iterationId}`,
    `updated=${normalizedUpdates.length};executed=${summary.executed};coverage=${summary.coverage};passRate=${summary.passRate}`);
  return { ok: true as const, data: normalized.changeControl, summary };
}
