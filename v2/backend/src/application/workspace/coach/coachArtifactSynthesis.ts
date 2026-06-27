/**
 * Coach 交付物合成 —— 在阶段编排过程中按需合成、提交、确认交付物草稿。
 * 包含抽取冷却控制（避免高频调用 LLM 抽取需求）和单交付物处理逻辑。
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl, hasPendingClarification } from '../shared/common';
import {
  saveIterationArtifactDraftOp,
  commitIterationArtifactOp,
  confirmIterationArtifactOp
} from '../changeControl/artifactOps';
import { isSubstantiveContent } from '../changeControl/artifactDraftSynthesizer';
import { synthesizeSingleArtifactOnDemand } from '../analysis/artifactSynthesisAgentOps';
import { isLowSignalText } from '../analysis/extractors';
import { extractRequirementsFromConversation } from './conversationRequirementExtractor';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("orchestrator");

// ── Extraction cooldown ──

const MAX_EXTRACTION_CACHE_SIZE = 500;
const lastExtractionAttempt = new Map<number, number>();

function recordExtractionAttempt(iterationId: number) {
  lastExtractionAttempt.set(iterationId, Date.now());
  // LRU 淘汰：超过上限时删除最早的条目
  if (lastExtractionAttempt.size > MAX_EXTRACTION_CACHE_SIZE) {
    const firstKey = lastExtractionAttempt.keys().next().value;
    if (firstKey != null) lastExtractionAttempt.delete(firstKey);
  }
}

async function ensureStructuredRequirements(
  agentRunner: AgentRunner,
  repo: WorkspaceRepository,
  iterationId: number,
  cc: ReturnType<typeof defaultIterationChangeControl>
): Promise<{ cc: ReturnType<typeof defaultIterationChangeControl>; workflow: ReturnType<typeof defaultIterationChangeControl>["artifactWorkflow"] | undefined } | null> {
  const coreIntent = cc.lastBusinessConfirmation?.coreIntent?.trim() || "";
  const bcEmpty = !coreIntent || isLowSignalText(coreIntent);
  const lastAttempt = lastExtractionAttempt.get(iterationId) ?? 0;
  const cooldownOk = Date.now() - lastAttempt > 30_000;
  if (!bcEmpty || !cooldownOk) return null;

  recordExtractionAttempt(iterationId);
  const extracted = await extractRequirementsFromConversation(agentRunner, repo, iterationId);
  if (!extracted) return null;

  const refreshed = repo.findIteration(iterationId);
  if (!refreshed) return null;
  const refreshedNormalized = normalizeIteration(refreshed);
  return {
    cc: refreshedNormalized.changeControl ?? defaultIterationChangeControl(),
    workflow: refreshedNormalized.changeControl?.artifactWorkflow
  };
}

type WorkflowItem = ReturnType<typeof defaultIterationChangeControl>["artifactWorkflow"]["items"][number];

const CLARIFICATION_GATED_ARTIFACTS = new Set(["product-requirements-doc"]);

function shouldBlockAutoConfirm(artifactId: string, pendingClarification: boolean): boolean {
  return pendingClarification && CLARIFICATION_GATED_ARTIFACTS.has(artifactId);
}

function processArtifactItem(
  repo: WorkspaceRepository,
  iterationId: number,
  artifactId: string,
  item: WorkflowItem,
  isDeclared: boolean,
  insufficientArtifacts: string[],
  committedArtifactTitles: string[],
  pendingClarification: boolean
) {
  if (item.outputVersion > 0 && item.gateStatus === "passed" && !item.stale) return;

  const draftEditedByHuman = item.draft?.updatedBy &&
    item.draft.updatedBy !== "system" && item.draft.updatedBy !== "orchestrator";
  const draftContent = (item.draft?.content ?? "").trim();
  const blockConfirm = shouldBlockAutoConfirm(artifactId, pendingClarification);

  // 已提交但 stale → 只清标记不重新提交（防级联 markDownstreamStale）
  if (item.outputVersion > 0 && item.stale) {
    if (isSubstantiveContent(draftContent) && !blockConfirm) {
      confirmIterationArtifactOp(repo, iterationId, artifactId, { actor: "orchestrator", passed: true });
    }
    return;
  }

  if (isSubstantiveContent(draftContent)) {
    if (!draftEditedByHuman) {
      saveIterationArtifactDraftOp(repo, iterationId, artifactId, { content: draftContent, actor: "orchestrator" });
    }
    if (item.outputVersion > 0 && !item.stale) {
      if (item.gateStatus !== "passed" && !blockConfirm) {
        confirmIterationArtifactOp(repo, iterationId, artifactId, { actor: "orchestrator", passed: true });
      }
    } else {
      commitIterationArtifactOp(repo, iterationId, artifactId, {
        actor: "orchestrator", summary: item.summary || item.title, source: "stage-orchestrator"
      });
      const alreadyConfirmedByHuman = item.lastConfirmedBy && item.lastConfirmedBy !== "orchestrator";
      if (!alreadyConfirmedByHuman && !blockConfirm) {
        confirmIterationArtifactOp(repo, iterationId, artifactId, { actor: "orchestrator", passed: true });
      }
      committedArtifactTitles.push(item.title);
    }
  } else if (isDeclared) {
    insufficientArtifacts.push(item.title);
  }
}

export async function attemptArtifactSynthesis(params: {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner;
  iterationId: number;
  gateResult: { blocked: boolean; currentStage: import('../../../domain/workspace/iterationTypes').IterationArtifactStage };
  agentDef: { allowedArtifacts: string[] };
  declaredArtifacts: string[];
  policyGate?: { blocked: boolean; reason: string; requiredActions: string[] } | null;
}) {
  const { repo, agentRunner, iterationId, gateResult, agentDef, declaredArtifacts, policyGate } = params;
  const freshIteration = repo.findIteration(iterationId);
  if (!freshIteration) return { insufficientArtifacts: [] as string[], committedArtifactTitles: [] as string[] };
  const normalized = normalizeIteration(freshIteration);
  let workflow = normalized.changeControl?.artifactWorkflow;
  const insufficientArtifacts: string[] = [];
  const committedArtifactTitles: string[] = [];

  // 硬阻断：stage gate 或 policy gate 阻断时不自动合成/提交/确认交付物
  if (gateResult.blocked || policyGate?.blocked || !workflow) return { insufficientArtifacts, committedArtifactTitles };

  const artifactsToAttempt = new Set(declaredArtifacts);
  for (const id of agentDef.allowedArtifacts) {
    const item = workflow.items.find((i) => i.id === id);
    if (item && item.gateStatus !== "passed") artifactsToAttempt.add(id);
  }
  if (artifactsToAttempt.size === 0) return { insufficientArtifacts, committedArtifactTitles };

  let cc = normalized.changeControl ?? defaultIterationChangeControl();
  const refreshed = await ensureStructuredRequirements(agentRunner, repo, iterationId, cc);
  if (refreshed) {
    cc = refreshed.cc;
    workflow = refreshed.workflow ?? workflow;
  }

  // 对 LLM 声明但无内容的交付物，尝试按需合成
  for (const artifactId of declaredArtifacts) {
    const item = workflow.items.find((i) => i.id === artifactId);
    if (!item || isSubstantiveContent(item.draft?.content ?? "")) continue;
    try {
      const result = await synthesizeSingleArtifactOnDemand(agentRunner, artifactId, normalized, cc);
      if (result.content && isSubstantiveContent(result.content)) {
        saveIterationArtifactDraftOp(repo, iterationId, artifactId, {
          content: result.content, actor: "orchestrator"
        });
        const refreshedIter = repo.findIteration(iterationId);
        if (refreshedIter) {
          workflow = normalizeIteration(refreshedIter).changeControl?.artifactWorkflow ?? workflow;
        }
      }
    } catch (err) {
      log.warn("on-demand artifact synthesis failed", { artifactId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const pendingClarification = hasPendingClarification(cc);

  for (const artifactId of artifactsToAttempt) {
    const item = workflow.items.find((i) => i.id === artifactId);
    if (!item) continue;
    processArtifactItem(repo, iterationId, artifactId, item, declaredArtifacts.includes(artifactId), insufficientArtifacts, committedArtifactTitles, pendingClarification);
  }

  return { insufficientArtifacts, committedArtifactTitles };
}
