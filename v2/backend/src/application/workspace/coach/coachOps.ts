import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationCoachChatResponse } from '../../../domain/workspace/types';
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import { dedupeActions, parseRecentSuggestedActions } from './replyGuard';
import { normalizeIterationMessageContent } from './messageSanitizer';
import { normalizeIteration } from '../shared/workspaceSupport';
import { handlePendingGitRequirementIntake } from './gitIntakeOps';
import { handleCoachPeriodicRepositorySync } from './repositorySyncOps';
import { runOpenclawSkillChainForCoach } from './openclawSkillsBridge';
import {
  appendPolicyExecutionLogOp,
  evaluatePolicyGateForCoachOp,
  getEffectiveOrchestrationPolicyForProjectOp
} from '../governance/policyOps';
import { orchestrateCoachMessage } from "./stageOrchestrator";

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
  const recentMessages = repo
    .listMessages(iterationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item) => ({ role: item.role, content: normalizeIterationMessageContent(item.role, item.content) }));
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);
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
      evidence: [gate.reason, `message=${message.slice(0, 180)}`]
    });
  }
  const policyGate = gate.blocked
    ? { blocked: true as const, reason: gate.reason, requiredActions: gate.requiredActions }
    : null;
  const skillChain = runOpenclawSkillChainForCoach({
    iteration: normalized,
    project: project ?? null,
    previousIterationName: previous?.name || "",
    userMessage: message
  });

  if (!agentRunner) {
    throw new LlmUnavailableError(skillChain.error || "openclaw_runtime_unavailable");
  }

  // ── 通过 StageOrchestrator 路由到阶段专职 Agent ──
  try {
    const response = await orchestrateCoachMessage({
      repo,
      agentRunner,
      iterationId,
      message,
      project: project ?? null,
      previous: previous ? normalizeIteration(previous) : null,
      policyGate
    });

    // 合并 skill chain 建议到 response
    if (skillChain.suggestedActions.length > 0) {
      const skillActions = dedupeActions(skillChain.suggestedActions, recentSuggestedActions);
      response.guidance.suggestedActions = dedupeActions(
        [...response.guidance.suggestedActions, ...skillActions],
        recentSuggestedActions
      );
    }
    if (skillChain.checklist.length > 0) {
      response.guidance.clarificationChecklist = Array.from(
        new Set([...response.guidance.clarificationChecklist, ...skillChain.checklist])
      ).slice(0, 8);
    }

    // Policy execution log
    if (activePolicy) {
      appendPolicyExecutionLogOp(repo, {
        projectId: normalized.projectId,
        iterationId: normalized.id,
        policyVersion: activePolicy.version,
        stage: gate.stage,
        action: "coach_reply_generated",
        result: "success",
        evidence: [
          response.reply.slice(0, 180),
          `skills=${skillChain.selectedSkills.join(" | ") || "none"}`,
          `skill_reasons=${skillChain.selectionReasons.join(" | ") || "none"}`,
          ...skillChain.evidence.slice(0, 4)
        ]
      });
    }

    // 消息持久化由前端统一负责
    return response;
  } catch (error) {
    if (error instanceof LlmInvocationError) {
      throw error;
    }
    throw new LlmInvocationError(error instanceof Error ? error.message : "coach_llm_error");
  }
}
