import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationCoachChatResponse } from '../../../domain/workspace/types';
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import { normalizeIteration } from '../shared/workspaceSupport';
import { handlePendingGitRequirementIntake } from './gitIntakeOps';
import { handleCoachPeriodicRepositorySync } from './repositorySyncOps';
import {
  appendPolicyExecutionLogOp,
  evaluatePolicyGateForCoachOp,
  getEffectiveOrchestrationPolicyForProjectOp
} from '../governance/policyOps';
import { orchestrateCoachMessage } from "./stageOrchestrator";
import { detectGateBypass, type PolicyGate } from "./postExecutionVerifier";

function logCoachPolicyExecution(
  repo: WorkspaceRepository,
  normalized: ReturnType<typeof normalizeIteration>,
  gate: ReturnType<typeof evaluatePolicyGateForCoachOp>,
  activePolicy: NonNullable<ReturnType<typeof getEffectiveOrchestrationPolicyForProjectOp>>,
  response: IterationCoachChatResponse,
  policyGate: PolicyGate
) {
  appendPolicyExecutionLogOp(repo, {
    projectId: normalized.projectId,
    iterationId: normalized.id,
    policyVersion: activePolicy.version,
    stage: gate.stage,
    action: "coach_reply_generated",
    result: "success",
    evidence: [response.reply.slice(0, 180)]
  });
  // V3 门禁绕过检测：policyGate 阻断但 LLM 仍声明推进类 action → 记 gate_bypass_attempt 审计
  const action = response.execution?.action;
  if (detectGateBypass(policyGate, typeof action === "string" ? action : "none")) {
    appendPolicyExecutionLogOp(repo, {
      projectId: normalized.projectId,
      iterationId: normalized.id,
      policyVersion: activePolicy.version,
      stage: gate.stage,
      action: "gate_bypass_attempt",
      result: "blocked",
      evidence: [`LLM 在门禁阻断下声明推进动作: ${action}`, `门禁原因: ${gate.reason}`]
    });
  }
}

export async function coachIterationConversationOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  message: string
): Promise<IterationCoachChatResponse | null> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  const project = repo.findProject(normalized.projectId);
  const repoSyncResponse = handleCoachPeriodicRepositorySync({
    repo,
    iteration: normalized
  });
  if (repoSyncResponse) {
    return repoSyncResponse;
  }
  const gitIntakeResponse = handlePendingGitRequirementIntake({
    repo,
    iteration: normalized,
    projectRepo: project?.repository ?? null,
    userMessage: message
  });
  if (gitIntakeResponse) {
    return gitIntakeResponse;
  }
  const activePolicy = getEffectiveOrchestrationPolicyForProjectOp(repo, normalized.projectId);
  const gate = evaluatePolicyGateForCoachOp(repo, normalized, message, activePolicy);
  if (gate.blocked && activePolicy) {
    appendPolicyExecutionLogOp(repo, {
      projectId: normalized.projectId,
      iterationId: normalized.id,
      policyVersion: activePolicy.version,
      stage: gate.stage,
      action: "coach_gate_check",
      result: "blocked",
      evidence: [gate.reason, `用户消息：${message.slice(0, 180)}`]
    });
  }
  const policyGate = gate.blocked
    ? { blocked: true as const, reason: gate.reason, requiredActions: gate.requiredActions }
    : null;

  if (!agentRunner) {
    throw new LlmUnavailableError("llm_runtime_unavailable");
  }

  // ── 通过 StageOrchestrator 路由到阶段专职 Agent ──
  try {
    const response = await orchestrateCoachMessage({
      repo, agentRunner, iterationId, message,
      project: project ?? null,
      previous: previous ? normalizeIteration(previous) : null,
      policyGate
    });
    if (activePolicy) {
      logCoachPolicyExecution(repo, normalized, gate, activePolicy, response, policyGate);
    }
    return response;
  } catch (error) {
    if (error instanceof LlmInvocationError) {
      throw error;
    }
    throw new LlmInvocationError(error instanceof Error ? error.message : "coach_llm_error");
  }
}
