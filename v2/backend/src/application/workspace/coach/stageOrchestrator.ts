/**
 * StageOrchestrator — 确定性编排引擎（本体 + re-export 桥接）
 *
 * 核心入口：orchestrateCoachMessage()
 *
 * 职责：
 * 1. 读 activeStage 确定当前阶段
 * 2. 通过 StageGateEvaluator 检查阻断
 * 3. 路由到当前阶段的 StageAgent
 * 4. Agent 返回后检查出口条件
 * 5. 出口条件满足 → 自动推进 activeStage
 *
 * 不持有状态，不做 LLM 推理判断。
 *
 * 子模块（按职责拆分，单向依赖，无循环）：
 * - coachResponseSanitizer: LLM 输出清洗（extractCoachMarker/stripInternalToolCalls/pickStringList）
 * - coachContextBuilder: 上下文序列化（buildStageContext/loadRecentMessages/formatRecentConversation）
 * - coachArtifactSynthesis: 交付物合成（attemptArtifactSynthesis）
 * - coachStageAdvance: 阶段推进（evaluateAndAdvanceStage）
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Iteration, IterationCoachChatResponse } from '../../../domain/workspace/types';
import type { Project } from '../../../domain/workspace/projectTypes';
import type { AgentRunner } from '../shared/agentRunner';
import type { ContinuationResult } from '../shared/agentContinuation';
import { runWithContinuation } from '../shared/agentContinuation';
import { normalizeIteration } from '../shared/workspaceSupport';
import { normalizeIterationMessageContent, sanitizeDisplayItem } from './messageSanitizer';
import { evaluateCurrentStageGate } from "./stageGateEvaluator";
import { getStageAgent } from "./stageAgents";
import { dedupeActions, parseRecentSuggestedActions } from './replyGuard';
import { sanitizeAction, sanitizeIntent } from './postExecutionVerifier';
import { pickString } from '../../../shared/utils';
import { writeAuditLog } from '../shared/common';
import { createLogger } from '../../../infrastructure/runtime/logger';
import { extractCoachMarker, stripInternalToolCalls, pickStringList } from './coachResponseSanitizer';
import { buildStageContext, loadRecentMessages, formatRecentConversation } from './coachContextBuilder';
import { attemptArtifactSynthesis } from './coachArtifactSynthesis';
import { evaluateAndAdvanceStage } from './coachStageAdvance';

// re-export 供既有调用方继续从本文件 import（兼容层）
export { extractCoachMarker, stripInternalToolCalls, pickStringList } from './coachResponseSanitizer';
export { buildStageContext, loadRecentMessages, formatRecentConversation } from './coachContextBuilder';
export { attemptArtifactSynthesis } from './coachArtifactSynthesis';
export { evaluateAndAdvanceStage } from './coachStageAdvance';

const log = createLogger("orchestrator");

// ── Phase: 路由到 StageAgent + 调用 LLM ──

function buildBlockerContext(
  gateResult: ReturnType<typeof evaluateCurrentStageGate>,
  policyGate?: { blocked: boolean; reason: string; requiredActions: string[] } | null
): string[] {
  const lines: string[] = [];
  if (gateResult.blocked) {
    lines.push(
      "", "⚠ 当前阶段存在阻断，需要先处理以下问题：",
      ...gateResult.blockers.map((b) => `  - ${b}`),
      "请在回复中：1）先回应用户的问题或疑问，不要忽略；2）简明说明阻断原因；3）给出用户可操作的具体建议（如上传什么材料、确认什么信息）。"
    );
  }
  if (policyGate?.blocked) {
    lines.push(
      "", "⚠ 项目策略约束：", `  - ${policyGate.reason}`,
      ...(policyGate.requiredActions.length > 0 ? [`  建议操作：${policyGate.requiredActions.join("、")}`] : [])
    );
  }
  return lines;
}

async function routeToStageAgent(params: {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner;
  iterationId: number;
  message: string;
  normalized: ReturnType<typeof normalizeIteration>;
  previous: Iteration | null;
  project: Project | null;
  gateResult: ReturnType<typeof evaluateCurrentStageGate>;
  policyGate?: { blocked: boolean; reason: string; requiredActions: string[] } | null;
}) {
  const { repo, agentRunner, iterationId, message, normalized, previous, project, gateResult, policyGate } = params;
  const agentDef = getStageAgent(gateResult.currentStage);
  const context = buildStageContext(
    normalized, previous ? normalizeIteration(previous) : null,
    project, gateResult.currentStage, gateResult
  );
  const recentMessagesList = loadRecentMessages(repo, iterationId);
  const recentConversation = formatRecentConversation(recentMessagesList);
  const recentMessages = recentMessagesList
    .map((item) => ({ role: item.role, content: normalizeIterationMessageContent(item.role as "user" | "assistant", item.content) }));
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);
  const blockedLines = buildBlockerContext(gateResult, policyGate);

  const prompt = {
    agentId: `agent-stage-${gateResult.currentStage}-1`,
    role: "iteration-coach" as const,
    scope: "iteration" as const,
    goal: (gateResult.blocked || policyGate?.blocked)
      ? `以「${agentDef.label}」角色回应用户问题并引导解决当前阻断`
      : `以「${agentDef.label}」角色引导用户推进当前阶段`,
    expectedOutput: "先用自然语言直接回复用户，最后一行附带 <!-- coach:{...} --> 结构化标记",
    systemPrompt: agentDef.systemPrompt,
    userPrompt: [
      `用户说：${message}`, "", "当前情况：", context, ...blockedLines, "",
      recentConversation,
      recentSuggestedActions.length > 0 ? `上轮已建议的行动（避免重复）：${recentSuggestedActions.join("、")}` : "",
      "", "请先用自然语言回复用户，然后在末尾附带 <!-- coach:{...} --> 控制标记。"
    ].filter(Boolean).join("\n")
  };

  const runLlm = () => runWithContinuation(agentRunner, prompt, {
    sessionContext: { projectId: normalized.projectId, iterationId: normalized.id }
  }, { maxContinuations: 2 });

  let continuationResult: ContinuationResult;
  try {
    continuationResult = await runLlm();
  } catch (firstError) {
    log.warn("first LLM attempt failed, retrying once", { error: firstError instanceof Error ? firstError.message : String(firstError) });
    await new Promise<void>((r) => setTimeout(r, 1500));
    continuationResult = await runLlm();
  }

  return { continuationResult, agentDef, recentSuggestedActions };
}

// ── Phase: 解析 Agent 返回 ──

function processAgentResponse(
  continuationResult: { content: string; model?: string },
  agentDef: ReturnType<typeof getStageAgent>,
  recentSuggestedActions: string[]
) {
  const { reply: extractedReply, marker } = extractCoachMarker(continuationResult.content);
  const parsed = marker;
  const guidance = (parsed?.guidance ?? {}) as Record<string, unknown>;
  const executionRaw = (parsed?.execution ?? {}) as Record<string, unknown>;

  const reply = stripInternalToolCalls(extractedReply || continuationResult.content.trim())
    .split("\n")
    .map((line) => sanitizeDisplayItem(line))
    .filter(Boolean)
    .join("\n");

  const declaredArtifacts = pickStringList(executionRaw.artifacts, 5)
    .filter((id) => agentDef.allowedArtifacts.includes(id));

  // action/intent 白名单校验上提到 postExecutionVerifier（V3 统一后验）
  const executionAction = sanitizeAction(executionRaw.action);

  const suggestedActionsRaw = pickStringList(guidance.suggestedActions, 8);
  const clarificationChecklistRaw = pickStringList(guidance.clarificationChecklist, 8);
  const mergedActions = dedupeActions(suggestedActionsRaw, recentSuggestedActions);
  const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
  const sanitizedActions = mergedActions.filter((action) => !KEBAB_CASE_RE.test(action.trim()));
  const clarificationChecklist = clarificationChecklistRaw
    .filter((item) => !KEBAB_CASE_RE.test(item.trim()))
    .map((item) => sanitizeDisplayItem(item))
    .filter(Boolean);

  const finalIntent = sanitizeIntent(parsed?.intent);

  return { reply, declaredArtifacts, executionAction, sanitizedActions, clarificationChecklist, finalIntent, guidance, executionRaw };
}

// ── Core orchestration ──

function buildDegradedResponse(iterationId: number, reason: string, model?: string): IterationCoachChatResponse {
  const isUsed = reason !== "iteration_not_found";
  return {
    iterationId, intent: "general",
    reply: reason === "iteration_not_found" ? "迭代不存在。" : "抱歉，我暂时无法回复。请稍后重试。",
    execution: { action: "none", instruction: "", apply: false },
    guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
    llm: { used: isUsed, model: model || "", degraded: isUsed, reason }
  };
}

function assembleCoachResponse(
  iterationId: number,
  parsed: ReturnType<typeof processAgentResponse>,
  continuationResult: { model?: string; continuations?: number; complete?: boolean },
  stageAdvanceNote: string,
  insufficientArtifacts: string[],
  committedArtifactTitles: string[]
): IterationCoachChatResponse {
  const insufficiencyNote = insufficientArtifacts.length > 0
    ? `\n\n${insufficientArtifacts.join("、")}暂未生成，可能需要更多上下文信息。你可以补充材料后再试。` : "";
  const artifactNote = committedArtifactTitles.length > 0
    ? `\n\n已为你生成以下交付物：${committedArtifactTitles.join("、")}。你可以在交付物面板中查看详情。` : "";
  return {
    iterationId,
    intent: parsed.finalIntent as IterationCoachChatResponse["intent"],
    reply: parsed.reply + stageAdvanceNote + insufficiencyNote + artifactNote,
    execution: {
      action: parsed.executionAction as NonNullable<IterationCoachChatResponse["execution"]>["action"],
      instruction: pickString(parsed.executionRaw.instruction),
      apply: Boolean(parsed.executionRaw.apply)
    },
    guidance: {
      uploadRecommended: Boolean(parsed.guidance.uploadRecommended),
      suggestedUploadTypes: pickStringList(parsed.guidance.suggestedUploadTypes, 6),
      suggestedActions: parsed.sanitizedActions,
      clarificationChecklist: parsed.clarificationChecklist
    },
    llm: {
      used: true, model: continuationResult.model || "",
      degraded: false, reason: "",
      continuations: continuationResult.continuations,
      contentComplete: continuationResult.complete
    }
  };
}

export async function orchestrateCoachMessage(params: {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner;
  iterationId: number;
  message: string;
  project: Project | null;
  previous: Iteration | null;
  policyGate?: { blocked: boolean; reason: string; requiredActions: string[] } | null;
}): Promise<IterationCoachChatResponse> {
  const { repo, agentRunner, iterationId } = params;

  const iteration = repo.findIteration(iterationId);
  if (!iteration) return buildDegradedResponse(iterationId, "iteration_not_found");

  const normalized = normalizeIteration(iteration);
  const gateResult = evaluateCurrentStageGate(normalized);

  if (gateResult.blocked) {
    writeAuditLog(repo, "orchestrator.blocked", `iteration:${iterationId}`, `stage=${gateResult.currentStage};blockers=${gateResult.blockers.map(sanitizeDisplayItem).join(",")}`);
  }

  const { continuationResult, agentDef, recentSuggestedActions } = await routeToStageAgent({
    ...params, normalized, gateResult
  });

  const parsed = processAgentResponse(continuationResult, agentDef, recentSuggestedActions);
  if (!parsed.reply) return buildDegradedResponse(iterationId, "empty_reply", continuationResult.model);

  // T1 运行/执行态分离：纯对话意图（询问/普通讨论）只回应对话，不产交付物、不推进阶段
  const isConversational = parsed.finalIntent === "general" || parsed.finalIntent === "question";
  let insufficientArtifacts: string[] = [];
  let committedArtifactTitles: string[] = [];
  let stageAdvanceNote = "";
  if (!isConversational) {
    ({ insufficientArtifacts, committedArtifactTitles } = await attemptArtifactSynthesis({
      repo, agentRunner, iterationId, gateResult, agentDef, declaredArtifacts: parsed.declaredArtifacts, policyGate: params.policyGate
    }));
    stageAdvanceNote = evaluateAndAdvanceStage(repo, iterationId, gateResult, agentRunner, params.policyGate);
  }

  return assembleCoachResponse(iterationId, parsed, continuationResult, stageAdvanceNote, insufficientArtifacts, committedArtifactTitles);
}
