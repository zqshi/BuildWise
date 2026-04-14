/**
 * StageOrchestrator — 确定性编排引擎
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
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Iteration, IterationCoachChatResponse } from '../../../domain/workspace/types';
import type { Project } from '../../../domain/workspace/projectTypes';
import type { IterationArtifactStage } from '../../../domain/workspace/iterationTypes';
import type { AgentRunner } from '../shared/agentRunner';
import { runWithContinuation } from '../shared/agentContinuation';
import { normalizeIteration } from '../shared/workspaceSupport';
import { normalizeIterationMessageContent, sanitizeForCoachContext, sanitizeDisplayItem } from './messageSanitizer';
import { evaluateCurrentStageGate, evaluateStageExitConditions, getNextStage } from "./stageGateEvaluator";
import { getStageAgent, STAGE_LABELS } from "./stageAgents";
import {
  saveIterationArtifactDraftOp,
  commitIterationArtifactOp,
  confirmIterationArtifactOp,
  transitionIterationArtifactStageOp
} from '../changeControl/artifactOps';
import { synthesizeArtifactDraftContent, isSubstantiveContent } from '../changeControl/artifactDraftSynthesizer';
import { defaultIterationChangeControl } from '../shared/common';
import { extractRequirementsFromConversation } from "./conversationRequirementExtractor";
import { buildKnowledgeSyncContext } from '../project/knowledgeSyncService';
import { dedupeActions, parseRecentSuggestedActions } from './replyGuard';
import { pickString } from '../../../shared/utils';
import { safeJsonParse } from '../upload/attachmentUtils';
import { writeAuditLog } from '../shared/common';

// ── Coach marker extraction (shared with CoachOps) ──

const COACH_MARKER_PATTERNS = [
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*-->/i,
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*$/i
];

function extractCoachMarkerFromText(text: string): { json: string; fullMatch: string } | null {
  for (const pattern of COACH_MARKER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { json: match[1] ?? "", fullMatch: match[0] };
    }
  }
  return null;
}

function extractCoachMarker(rawContent: string): { reply: string; marker: Record<string, unknown> | null } {
  const extracted = extractCoachMarkerFromText(rawContent);
  if (extracted) {
    const reply = rawContent.replace(extracted.fullMatch, "").trim();
    return { reply, marker: safeJsonParse(extracted.json) };
  }
  const parsed = safeJsonParse(rawContent);
  if (parsed && typeof parsed.reply === "string") {
    return { reply: parsed.reply, marker: parsed };
  }
  return { reply: rawContent.trim(), marker: null };
}

function stripInternalToolCalls(reply: string) {
  let text = reply;
  text = text.replace(/<minimax_tool_call>[\s\S]*?<\/minimax_tool_call>/gi, "");
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  text = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  // 替换 LLM 泄漏的内部字段名为业务语言
  text = text.replace(/\binScope\b/g, "本轮范围");
  text = text.replace(/\boutOfScope\b/g, "明确不做");
  // 清理已知的内部 kebab-case 标识符（白名单模式，避免误删合法英文词如 e-commerce、end-to-end）
  const INTERNAL_IDENTIFIERS = [
    "advance-phase", "boundary-confirmation", "confirm-boundary",
    "run-full-cycle", "enter-clarify-mode", "confirm-accurate",
    "confirm-inaccurate", "capture-business-rule", "collect-attachment",
    "stage-transition", "gate-check", "artifact-commit", "artifact-confirm",
    "coach-reply", "policy-gate", "agent-selected"
  ];
  for (const id of INTERNAL_IDENTIFIERS) {
    text = text.replaceAll(id, "");
  }
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[skills\]/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickStringList(value: unknown, max = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

// ── Context builders ──

function buildStageContext(
  iteration: Iteration,
  previous: Iteration | null,
  project: Project | null,
  stage: IterationArtifactStage,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>
): string {
  const parts: string[] = [];

  // 迭代基础信息
  parts.push(
    `当前迭代「${iteration.name}」处于「${STAGE_LABELS[stage]}」阶段。` +
    (previous ? `上一轮迭代是「${previous.name}」。` : "这是第一轮迭代。")
  );

  // 范围
  if (iteration.scope.inScope.length > 0) {
    parts.push(`本轮范围：${iteration.scope.inScope.join("、")}。`);
  }
  if (iteration.scope.outOfScope.length > 0) {
    parts.push(`明确不做：${iteration.scope.outOfScope.join("、")}。`);
  }

  // 分析状态
  if (iteration.changeControl?.lastAnalysisAt) {
    parts.push(`最近分析时间：${iteration.changeControl.lastAnalysisAt}。`);
  }
  if (iteration.changeControl?.confirmedAt) {
    parts.push("分析报告已确认。");
  }

  // 边界
  const boundary = iteration.changeControl?.boundary;
  if (boundary && boundary.requirementRefs.length > 0) {
    parts.push(`变更边界：需求 ${boundary.requirementRefs.length} 项，组件 ${boundary.componentRefs.length} 项，代码路径 ${boundary.codePaths.length} 条。`);
  }

  // 业务确认摘要（来自 LLM 分析，边界字段可能还没手动填充但分析已完成）
  const biz = iteration.changeControl?.lastBusinessConfirmation;
  if (biz?.coreIntent) {
    const bizParts: string[] = [`分析结论：${biz.coreIntent}`];
    if (biz.boundarySummary) bizParts.push(`边界摘要：${biz.boundarySummary}`);
    const na = biz.necessityAssessment;
    if (na?.mustDo?.length) bizParts.push(`必须完成：${na.mustDo.join("、")}`);
    if (na?.outOfScope?.length) bizParts.push(`明确排除：${na.outOfScope.join("、")}`);
    if (biz.functionalPoints?.length) bizParts.push(`功能要点：${biz.functionalPoints.slice(0, 6).join("、")}`);
    parts.push(bizParts.join("\n"));
  }

  // 知识上下文
  const knowledgeCtx = buildKnowledgeSyncContext(project?.knowledgeBase ?? null);
  if (knowledgeCtx) {
    parts.push(knowledgeCtx);
  }

  // 澄清问题
  const unresolved = iteration.changeControl?.lastClarificationResolution?.unresolvedQuestions ?? [];
  if (unresolved.length > 0) {
    parts.push(`未解决的澄清问题：${unresolved.join("；")}。`);
  }

  // 出口条件状态
  if (gateResult.missingArtifacts.length > 0) {
    parts.push(`本阶段还缺少：${gateResult.missingArtifacts.join("、")}。`);
  }
  if (gateResult.canProceed) {
    parts.push("本阶段出口条件已满足，可以推进到下一阶段。");
  }

  // 已完成的交付物
  const workflow = iteration.changeControl?.artifactWorkflow;
  if (workflow) {
    const readyItems = workflow.items
      .filter((i) => i.status === "ready" && i.outputVersion > 0)
      .map((i) => i.title);
    if (readyItems.length > 0) {
      parts.push(`已完成的交付物：${readyItems.join("、")}。这些交付物无需重复声明。`);
    }
  }

  // 仓库信息
  if (project?.repository?.url) {
    parts.push(`项目已配置代码仓库（${project.repository.url}）。`);
  }

  return parts.filter(Boolean).join("\n");
}

function buildRecentConversation(repo: WorkspaceRepository, iterationId: number): string {
  const messages = repo
    .listMessages(iterationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item, idx) => {
      const roleLabel = item.role === "user" ? "用户" : "教练";
      const content = sanitizeForCoachContext(
        normalizeIterationMessageContent(item.role, item.content).slice(0, 400).replace(/\s+/g, " ")
      );
      return `  ${idx + 1}. ${roleLabel}：${content}`;
    });
  if (messages.length === 0) return "";
  return `最近对话：\n${messages.join("\n")}`;
}

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

// ── Phase: 路由到 StageAgent + 调用 LLM ──

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
  const recentConversation = buildRecentConversation(repo, iterationId);
  const recentMessages = repo
    .listMessages(iterationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item) => ({ role: item.role, content: normalizeIterationMessageContent(item.role, item.content) }));
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);

  const blockedLines: string[] = [];
  if (gateResult.blocked) {
    blockedLines.push(
      "", "⚠ 当前阶段存在阻断，需要先处理以下问题：",
      ...gateResult.blockers.map((b) => `  - ${b}`),
      "请在回复中：1）先回应用户的问题或疑问，不要忽略；2）简明说明阻断原因；3）给出用户可操作的具体建议（如上传什么材料、确认什么信息）。"
    );
  }
  if (policyGate?.blocked) {
    blockedLines.push(
      "", "⚠ 项目策略约束：", `  - ${policyGate.reason}`,
      ...(policyGate.requiredActions.length > 0 ? [`  建议操作：${policyGate.requiredActions.join("、")}`] : [])
    );
  }

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
      `用户说：${message}`, "", `当前情况：`, context, ...blockedLines, "",
      recentConversation,
      recentSuggestedActions.length > 0 ? `上轮已建议的行动（避免重复）：${recentSuggestedActions.join("、")}` : "",
      "", "请先用自然语言回复用户，然后在末尾附带 <!-- coach:{...} --> 控制标记。"
    ].filter(Boolean).join("\n")
  };

  const runLlm = () => runWithContinuation(agentRunner, prompt, {
    sessionContext: { projectId: normalized.projectId, iterationId: normalized.id }
  }, { maxContinuations: 2 });

  let continuationResult;
  try {
    continuationResult = await runLlm();
  } catch (firstError) {
    console.warn("[orchestrator] First LLM attempt failed, retrying once",
      firstError instanceof Error ? firstError.message : String(firstError));
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

  const validActionSet = new Set(["none", "rewrite", "confirm-accurate", "confirm-inaccurate", "enter-clarify-mode", "run-full-cycle", "capture-business-rule"]);
  const actionRaw = pickString(executionRaw.action);
  const executionAction = validActionSet.has(actionRaw) ? actionRaw : "none";

  const suggestedActionsRaw = pickStringList(guidance.suggestedActions, 8);
  const clarificationChecklist = pickStringList(guidance.clarificationChecklist, 8);
  const mergedActions = dedupeActions(suggestedActionsRaw, recentSuggestedActions);
  const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
  const sanitizedActions = mergedActions.filter((action) => !KEBAB_CASE_RE.test(action.trim()));

  const validIntentSet = new Set(["collect-attachment", "clarify", "confirm-boundary", "plan", "qa", "release", "full-cycle", "general"]);
  const modelIntent = pickString(parsed?.intent);
  const finalIntent = validIntentSet.has(modelIntent) ? modelIntent : "general";

  return { reply, declaredArtifacts, executionAction, sanitizedActions, clarificationChecklist, finalIntent, guidance, executionRaw };
}

// ── Phase: 交付物合成 ──

async function attemptArtifactSynthesis(params: {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner;
  iterationId: number;
  gateResult: ReturnType<typeof evaluateCurrentStageGate>;
  agentDef: ReturnType<typeof getStageAgent>;
  declaredArtifacts: string[];
}) {
  const { repo, agentRunner, iterationId, gateResult, agentDef, declaredArtifacts } = params;
  // LLM 调用后刷新数据，避免使用过期快照
  const freshIteration = repo.findIteration(iterationId);
  if (!freshIteration) return { insufficientArtifacts: [] as string[], committedArtifactTitles: [] as string[] };
  let normalized = normalizeIteration(freshIteration);
  let workflow = normalized.changeControl?.artifactWorkflow;
  const insufficientArtifacts: string[] = [];
  const committedArtifactTitles: string[] = [];

  if (gateResult.blocked || !workflow) {
    return { insufficientArtifacts, committedArtifactTitles };
  }

  const artifactsToAttempt = new Set(declaredArtifacts);
  for (const id of agentDef.allowedArtifacts) {
    const item = workflow.items.find((i) => i.id === id);
    if (item && item.gateStatus !== "passed") {
      artifactsToAttempt.add(id);
    }
  }
  if (artifactsToAttempt.size === 0) {
    return { insufficientArtifacts, committedArtifactTitles };
  }

  let cc = normalized.changeControl ?? defaultIterationChangeControl();
  let currentNormalized = normalized;

  // 前置检查：结构化需求数据缺失时，先从对话提取再合成
  const bcEmpty = !cc.lastBusinessConfirmation?.coreIntent?.trim();
  const lastAttempt = lastExtractionAttempt.get(iterationId) ?? 0;
  const cooldownOk = Date.now() - lastAttempt > 30_000;
  if (bcEmpty && cooldownOk) {
    recordExtractionAttempt(iterationId);
    const extracted = await extractRequirementsFromConversation(agentRunner, repo, iterationId);
    if (extracted) {
      const refreshed = repo.findIteration(iterationId);
      if (refreshed) {
        currentNormalized = normalizeIteration(refreshed);
        cc = currentNormalized.changeControl ?? defaultIterationChangeControl();
        workflow = currentNormalized.changeControl?.artifactWorkflow ?? workflow;
      }
    }
  }

  for (const artifactId of artifactsToAttempt) {
    const item = workflow.items.find((i) => i.id === artifactId);
    if (!item) continue;

    // 幂等守卫：已提交 + 已确认 + 未过期 → 跳过，不重复 commit/announce
    if (item.outputVersion > 0 && item.gateStatus === "passed" && !item.stale) continue;

    const draftEditedByHuman = item.draft?.updatedBy &&
      item.draft.updatedBy !== "system" && item.draft.updatedBy !== "orchestrator";
    const existingDraft = (item.draft?.content ?? "").trim();
    let draftContent = existingDraft;
    if (!draftEditedByHuman && !isSubstantiveContent(draftContent)) {
      draftContent = synthesizeArtifactDraftContent(artifactId, currentNormalized, cc);
    }

    if (isSubstantiveContent(draftContent)) {
      if (!draftEditedByHuman) {
        saveIterationArtifactDraftOp(repo, iterationId, artifactId, { content: draftContent, actor: "orchestrator" });
      }
      // 已提交但未确认（如人工 commit 后等待确认） → 仅确认，不重复提交
      if (item.outputVersion > 0 && !item.stale) {
        if (item.gateStatus !== "passed") {
          confirmIterationArtifactOp(repo, iterationId, artifactId, { actor: "orchestrator", passed: true });
        }
      } else {
        commitIterationArtifactOp(repo, iterationId, artifactId, {
          actor: "orchestrator", summary: item.summary || item.title, source: "stage-orchestrator"
        });
        const alreadyConfirmedByHuman = item.lastConfirmedBy && item.lastConfirmedBy !== "orchestrator";
        if (!alreadyConfirmedByHuman) {
          confirmIterationArtifactOp(repo, iterationId, artifactId, { actor: "orchestrator", passed: true });
        }
        committedArtifactTitles.push(item.title);
      }
    } else if (declaredArtifacts.includes(artifactId)) {
      insufficientArtifacts.push(item.title);
    }
  }

  return { insufficientArtifacts, committedArtifactTitles };
}

// ── Phase: 阶段出口检查 + 自动推进 ──

function evaluateAndAdvanceStage(
  repo: WorkspaceRepository,
  iterationId: number,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>
): string {
  if (gateResult.blocked) return "";

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
    currentCheckStage = nextStage;
  }

  if (advancedStages.length > 0) {
    return `\n\n${advancedStages.join("、")}阶段已完成，我们进入「${STAGE_LABELS[currentCheckStage]}」阶段了。`;
  }
  return "";
}

// ── Core orchestration ──

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
  if (!iteration) {
    return {
      iterationId, intent: "general", reply: "迭代不存在。",
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
      llm: { used: false, model: "", degraded: false, reason: "iteration_not_found" }
    };
  }

  const normalized = normalizeIteration(iteration);
  const gateResult = evaluateCurrentStageGate(normalized);

  if (gateResult.blocked) {
    writeAuditLog(repo, "orchestrator.blocked", `iteration:${iterationId}`, `stage=${gateResult.currentStage};blockers=${gateResult.blockers.join(",")}`);
  }

  // Phase 1: 路由 + LLM 调用
  const { continuationResult, agentDef, recentSuggestedActions } = await routeToStageAgent({
    ...params, normalized, gateResult
  });

  // Phase 2: 解析 Agent 返回
  const parsed = processAgentResponse(continuationResult, agentDef, recentSuggestedActions);
  if (!parsed.reply) {
    return {
      iterationId, intent: "general", reply: "抱歉，我暂时无法回复。请稍后重试。",
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
      llm: { used: true, model: continuationResult.model || "", degraded: true, reason: "empty_reply" }
    };
  }

  // Phase 3: 交付物合成
  const { insufficientArtifacts, committedArtifactTitles } = await attemptArtifactSynthesis({
    repo, agentRunner, iterationId, gateResult, agentDef, declaredArtifacts: parsed.declaredArtifacts
  });

  // Phase 4: 阶段推进
  const stageAdvanceNote = evaluateAndAdvanceStage(repo, iterationId, gateResult);

  // 组装最终回复
  const insufficiencyNote = insufficientArtifacts.length > 0
    ? `\n\n目前信息还不够生成${insufficientArtifacts.join("、")}，需要你先补充材料或确认关键信息。` : "";
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
