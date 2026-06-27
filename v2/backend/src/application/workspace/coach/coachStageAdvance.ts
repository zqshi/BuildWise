/**
 * Coach 阶段推进 —— 检查出口条件并在满足时自动推进 activeStage，穿越空门禁阶段。
 * 硬阻断时（stage gate 或 policy gate）不推进，仅返回空串。
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import { normalizeIteration } from '../shared/workspaceSupport';
import { evaluateStageExitConditions, getNextStage } from './stageGateEvaluator';
import type { evaluateCurrentStageGate } from './stageGateEvaluator';
import { STAGE_LABELS } from './stageAgents';
import { transitionIterationArtifactStageOp } from '../changeControl/artifactOps';
import { writeAuditLog } from '../shared/common';
import { maybeExtractExperience } from '../experience/extractionOps';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("orchestrator");

export function evaluateAndAdvanceStage(
  repo: WorkspaceRepository,
  iterationId: number,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>,
  agentRunner?: AgentRunner,
  policyGate?: { blocked: boolean; reason: string; requiredActions: string[] } | null
): string {
  // 硬阻断：stage gate 或 policy gate 任一阻断都不推进阶段（但 LLM 对话回复不受影响，由 routeToStageAgent 保证）
  if (gateResult.blocked || policyGate?.blocked) return "";

  let currentCheckStage = gateResult.currentStage;
  const advancedStages: string[] = [];

  for (let safetyLimit = 0; safetyLimit < 7; safetyLimit++) {
    const freshIteration = repo.findIteration(iterationId);
    if (!freshIteration) break;
    const freshNormalized = normalizeIteration(freshIteration);
    const exitCheck = evaluateStageExitConditions(freshNormalized, currentCheckStage);
    if (!exitCheck.satisfied) break;

    const nextStage = getNextStage(currentCheckStage);
    if (!nextStage) break;

    const transitionResult = transitionIterationArtifactStageOp(repo, iterationId, nextStage, {
      actor: "orchestrator",
      note: advancedStages.length === 0 ? "出口条件满足，自动推进" : "空门禁阶段，自动穿越"
    });
    if (!transitionResult.ok) break;

    advancedStages.push(STAGE_LABELS[currentCheckStage]);
    writeAuditLog(repo, "orchestrator.stage_advanced", `iteration:${iterationId}`, `from=${currentCheckStage};to=${nextStage}`);

    if (agentRunner && freshIteration) {
      maybeExtractExperience(repo, agentRunner, "stage-gate-passed", {
        projectId: freshIteration.projectId,
        iterationId,
        iteration: freshNormalized,
        stage: currentCheckStage
      }).catch((err) => log.error(`经验提取失败: ${err}`));
    }

    currentCheckStage = nextStage;
  }

  if (advancedStages.length > 0) {
    return `\n\n${advancedStages.join("、")}阶段已完成，我们进入「${STAGE_LABELS[currentCheckStage]}」阶段了。`;
  }
  return "";
}
