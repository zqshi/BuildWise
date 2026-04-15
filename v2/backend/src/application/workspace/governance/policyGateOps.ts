import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { nowIso } from '../../../shared/utils';
import type { Iteration, PolicyExecutionLogRecord } from '../../../domain/workspace/types';
import { artifactStageOrder } from '../changeControl/artifactWorkflow';

function nextId(items: Array<{ id: number }>) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
}

export function listPolicyExecutionLogsOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listPolicyExecutionLogs(iterationId);
}

export function appendPolicyExecutionLogOp(
  repo: WorkspaceRepository,
  input: Omit<PolicyExecutionLogRecord, "id" | "createdAt">
) {
  const current = repo.listPolicyExecutionLogs(input.iterationId);
  const record: PolicyExecutionLogRecord = {
    id: nextId(current),
    projectId: input.projectId,
    iterationId: input.iterationId,
    policyVersion: input.policyVersion,
    stage: input.stage,
    action: input.action,
    result: input.result,
    evidence: input.evidence,
    createdAt: nowIso()
  };
  repo.appendPolicyExecutionLog(record);
  return record;
}

// ── Artifact status helpers for structured gate evaluation ──

function hasArtifactReady(iteration: Iteration, artifactId: string): boolean {
  const items = iteration.changeControl?.artifactWorkflow?.items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => item.id === artifactId && item.status === "ready");
}

function hasHumanConfirmationForStage(iteration: Iteration, stage: string): boolean {
  if (stage === "clarification") {
    return !!(iteration.changeControl?.confirmedAt);
  }
  if (stage === "scope") {
    const boundary = iteration.changeControl?.boundary;
    return !!(boundary?.requirementRefs?.length && boundary?.updatedAt);
  }
  const items = iteration.changeControl?.artifactWorkflow?.items;
  if (!Array.isArray(items)) return false;
  return items
    .filter((item) => item.stage === stage)
    .some((item) => item.lastConfirmedAt !== "" && item.lastConfirmedBy !== "");
}

type GateResult = { blocked: boolean; stage: string; reason: string; requiredActions: string[] };

function checkStaleArtifacts(iteration: Iteration, stage: string): GateResult | null {
  const workflowItems = iteration.changeControl?.artifactWorkflow?.items ?? [];
  const currentStageIndex = artifactStageOrder.indexOf(stage as typeof artifactStageOrder[number]);
  const staleInCurrentOrEarlier = workflowItems.filter((item) => {
    if (!item.stale) return false;
    if (item.outputVersion === 0) return false;
    const itemStageIndex = artifactStageOrder.indexOf(item.stage);
    return itemStageIndex >= 0 && itemStageIndex <= currentStageIndex;
  });
  if (staleInCurrentOrEarlier.length === 0) return null;
  const staleNames = staleInCurrentOrEarlier.map((i) => `「${i.title}」`).join("、");
  return {
    blocked: true, stage,
    reason: `有 ${staleInCurrentOrEarlier.length} 个交付物因上游变更已过时需要更新：${staleNames}`,
    requiredActions: staleInCurrentOrEarlier.map((i) => `请先更新${i.title}`)
  };
}

function checkFirstIterationGitReport(
  repo: WorkspaceRepository,
  iteration: Iteration,
  activePolicy: import("../../../domain/workspace/types").ProjectPolicyRecord,
  stage: string
): GateResult | null {
  if (!activePolicy.strategy.requiredConfirmations.firstIterationGitReport) return null;
  const firstIterationId = repo.listIterations(iteration.projectId).sort((a, b) => a.id - b.id)[0]?.id || iteration.id;
  if (iteration.id !== firstIterationId) return null;
  const hasConfirmed = iteration.changeControl?.confirmedBy !== "" && iteration.changeControl?.confirmedBy != null;
  if (hasConfirmed) return null;
  return { blocked: true, stage, reason: "首版需先完成分析报告确认", requiredActions: ["请先确认分析报告后再推进当前阶段"] };
}

function checkPolicyGates(iteration: Iteration, activePolicy: import("../../../domain/workspace/types").ProjectPolicyRecord, stage: string): GateResult | null {
  const matchedGates = activePolicy.strategy.gates.filter((g) => g.stage === stage);
  for (const gate of matchedGates) {
    const missingArtifacts = gate.requiredArtifacts.filter((artifact) => !hasArtifactReady(iteration, artifact));
    if (missingArtifacts.length > 0) {
      return { blocked: true, stage, reason: `阶段 ${stage} 缺少必要制品: ${missingArtifacts.join(", ")}`, requiredActions: missingArtifacts.map((a) => `请先完成 ${a}`) };
    }
    if (gate.requireHumanConfirmation && !hasHumanConfirmationForStage(iteration, stage)) {
      return { blocked: true, stage, reason: `阶段 ${stage} 需要人工确认后才能推进`, requiredActions: [`请确认 ${stage} 阶段的相关制品后再继续`] };
    }
  }
  return null;
}

export function evaluatePolicyGateForCoachOp(
  repo: WorkspaceRepository,
  iteration: Iteration,
  _message: string,
  activePolicy: import("../../../domain/workspace/types").ProjectPolicyRecord | null
): GateResult {
  const stage = iteration.changeControl?.artifactWorkflow?.activeStage || "clarification";
  const staleResult = checkStaleArtifacts(iteration, stage);
  if (staleResult) return staleResult;
  if (!activePolicy) return { blocked: false, stage, reason: "", requiredActions: [] };
  const gitReportResult = checkFirstIterationGitReport(repo, iteration, activePolicy, stage);
  if (gitReportResult) return gitReportResult;
  const gateResult = checkPolicyGates(iteration, activePolicy, stage);
  if (gateResult) return gateResult;
  return { blocked: false, stage, reason: "", requiredActions: [] };
}
