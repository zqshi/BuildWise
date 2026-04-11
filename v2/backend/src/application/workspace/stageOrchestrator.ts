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

import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse } from "../../domain/workspace/types";
import type { Project } from "../../domain/workspace/projectTypes";
import type { IterationArtifactStage } from "../../domain/workspace/iterationTypes";
import type { AgentRunner } from "./agentRunner";
import { runWithContinuation } from "./agentContinuation";
import { normalizeIteration } from "./workspaceSupport";
import { normalizeIterationMessageContent, sanitizeForCoachContext } from "./workspaceMessageSanitizer";
import { evaluateCurrentStageGate, evaluateStageExitConditions, getNextStage } from "./stageGateEvaluator";
import { getStageAgent, STAGE_LABELS } from "./stageAgents";
import { transitionIterationArtifactStageOp } from "./workspaceServiceChangeControlArtifactOps";
import { buildKnowledgeSyncContext } from "./knowledgeSyncService";
import { dedupeActions, parseRecentSuggestedActions } from "./workspaceCoachReplyGuard";
import { pickString } from "../../shared/utils";
import { safeJsonParse } from "./workspaceServiceAttachmentUtils";
import { publishArtifactReferenceMessage } from "./workspaceArtifactConversationPolicy";
import { writeAuditLog } from "./workspaceServiceCommon";

// ── Coach marker extraction (shared with CoachOps) ──

const COACH_MARKER_PATTERNS = [
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*-->/i,
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*$/i
];

function extractCoachMarkerFromText(text: string): { json: string; fullMatch: string } | null {
  for (const pattern of COACH_MARKER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { json: match[1]!, fullMatch: match[0] };
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

// ── Blocked response builder ──

function buildBlockedResponse(
  iterationId: number,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>
): IterationCoachChatResponse {
  const staleNote = gateResult.staleArtifacts.length > 0
    ? `有 ${gateResult.staleArtifacts.length} 个交付物因上游变更需要更新：${gateResult.staleArtifacts.join("、")}。`
    : "";
  const blockNote = gateResult.blockers
    .filter((b) => !gateResult.staleArtifacts.some((s) => b.includes(s)))
    .join("；");

  const reply = [
    staleNote,
    blockNote,
    "先把这些问题处理完，我们再继续推进。"
  ].filter(Boolean).join("\n");

  return {
    iterationId,
    intent: "clarify",
    reply,
    execution: { action: "none", instruction: "", apply: false },
    guidance: {
      uploadRecommended: false,
      suggestedUploadTypes: [],
      suggestedActions: gateResult.blockers.slice(0, 4),
      clarificationChecklist: []
    },
    llm: { used: false, model: "stage-gate", degraded: false, reason: "blocked_by_gate" }
  };
}

// ── Core orchestration ──

export async function orchestrateCoachMessage(params: {
  repo: WorkspaceRepository;
  agentRunner: AgentRunner;
  iterationId: number;
  message: string;
  project: Project | null;
  previous: Iteration | null;
}): Promise<IterationCoachChatResponse> {
  const { repo, agentRunner, iterationId, message, project, previous } = params;

  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return {
      iterationId,
      intent: "general",
      reply: "迭代不存在。",
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
      llm: { used: false, model: "", degraded: false, reason: "iteration_not_found" }
    };
  }

  const normalized = normalizeIteration(iteration);
  const gateResult = evaluateCurrentStageGate(normalized);

  // 1. 阻断检查
  if (gateResult.blocked) {
    writeAuditLog(repo, "orchestrator.blocked", `iteration:${iterationId}`, `stage=${gateResult.currentStage};blockers=${gateResult.blockers.join(",")}`);
    return buildBlockedResponse(iterationId, gateResult);
  }

  // 2. 路由到当前阶段的 StageAgent
  const agentDef = getStageAgent(gateResult.currentStage);
  const context = buildStageContext(
    normalized,
    previous ? normalizeIteration(previous) : null,
    project,
    gateResult.currentStage,
    gateResult
  );
  const recentConversation = buildRecentConversation(repo, iterationId);
  const recentMessages = repo
    .listMessages(iterationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item) => ({ role: item.role, content: normalizeIterationMessageContent(item.role, item.content) }));
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);

  const prompt = {
    agentId: `agent-stage-${gateResult.currentStage}-1`,
    role: "iteration-coach" as const,
    scope: "iteration" as const,
    goal: `以「${agentDef.label}」角色引导用户推进当前阶段`,
    expectedOutput: "先用自然语言直接回复用户，最后一行附带 <!-- coach:{...} --> 结构化标记",
    systemPrompt: agentDef.systemPrompt,
    userPrompt: [
      `用户说：${message}`,
      "",
      `当前情况：`,
      context,
      "",
      recentConversation,
      recentSuggestedActions.length > 0
        ? `上轮已建议的行动（避免重复）：${recentSuggestedActions.join("、")}`
        : "",
      "",
      "请先用自然语言回复用户，然后在末尾附带 <!-- coach:{...} --> 控制标记。"
    ].filter(Boolean).join("\n")
  };

  // 3. 调用 LLM
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

  // 4. 解析 Agent 返回
  const { reply: extractedReply, marker } = extractCoachMarker(continuationResult.content);
  const parsed = marker;
  const guidance = (parsed?.guidance ?? {}) as Record<string, unknown>;
  const executionRaw = (parsed?.execution ?? {}) as Record<string, unknown>;

  const reply = stripInternalToolCalls(extractedReply || continuationResult.content.trim());
  if (!reply) {
    return {
      iterationId,
      intent: "general",
      reply: "抱歉，我暂时无法回复。请稍后重试。",
      execution: { action: "none", instruction: "", apply: false },
      guidance: { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] },
      llm: { used: true, model: continuationResult.model || "", degraded: true, reason: "empty_reply" }
    };
  }

  // 过滤：Agent 声明的 artifacts 只允许本阶段可用的
  const declaredArtifacts = pickStringList(executionRaw.artifacts, 5)
    .filter((id) => agentDef.allowedArtifacts.includes(id));

  const validActionSet = new Set(["none", "rewrite", "confirm-accurate", "confirm-inaccurate", "enter-clarify-mode", "run-full-cycle", "capture-business-rule"]);
  const actionRaw = pickString(executionRaw.action);
  const executionAction = validActionSet.has(actionRaw) ? actionRaw : "none";

  const suggestedActionsRaw = pickStringList(guidance.suggestedActions, 8);
  const clarificationChecklist = pickStringList(guidance.clarificationChecklist, 8);
  const mergedActions = dedupeActions(suggestedActionsRaw, recentSuggestedActions);

  const validIntentSet = new Set(["collect-attachment", "clarify", "confirm-boundary", "plan", "qa", "release", "full-cycle", "general"]);
  const modelIntent = pickString(parsed?.intent);
  const finalIntent = validIntentSet.has(modelIntent) ? modelIntent : "general";

  // 5. 发布 Agent 声明的交付物
  const workflow = normalized.changeControl?.artifactWorkflow;
  if (declaredArtifacts.length > 0 && workflow) {
    for (const artifactId of declaredArtifacts) {
      const item = workflow.items.find((i) => i.id === artifactId);
      if (item) {
        publishArtifactReferenceMessage(repo, iterationId, {
          title: item.title,
          summary: item.summary || item.description,
          evidence: item.evidence || [],
          draftContent: item.draft?.content || "",
          prompt: `请围绕交付物「${item.title}」继续确认。`
        });
      }
    }
  }

  // 6. 检查阶段出口条件，满足则自动推进
  let stageAdvanceNote = "";
  const freshIteration = repo.findIteration(iterationId);
  if (freshIteration) {
    const freshNormalized = normalizeIteration(freshIteration);
    const exitCheck = evaluateStageExitConditions(freshNormalized, gateResult.currentStage);
    if (exitCheck.satisfied) {
      const nextStage = getNextStage(gateResult.currentStage);
      if (nextStage) {
        const transitionResult = transitionIterationArtifactStageOp(repo, iterationId, nextStage, {
          actor: "orchestrator",
          note: "出口条件满足，自动推进"
        });
        if (transitionResult.ok) {
          stageAdvanceNote = `\n\n${STAGE_LABELS[gateResult.currentStage]}阶段已完成，我们进入「${STAGE_LABELS[nextStage]}」阶段了。`;
          writeAuditLog(repo, "orchestrator.stage_advanced", `iteration:${iterationId}`, `from=${gateResult.currentStage};to=${nextStage}`);
        }
      }
    }
  }

  const response: IterationCoachChatResponse = {
    iterationId,
    intent: finalIntent as IterationCoachChatResponse["intent"],
    reply: reply + stageAdvanceNote,
    execution: {
      action: executionAction as NonNullable<IterationCoachChatResponse["execution"]>["action"],
      instruction: pickString(executionRaw.instruction),
      apply: Boolean(executionRaw.apply)
    },
    guidance: {
      uploadRecommended: Boolean(guidance.uploadRecommended),
      suggestedUploadTypes: pickStringList(guidance.suggestedUploadTypes, 6),
      suggestedActions: mergedActions,
      clarificationChecklist
    },
    llm: {
      used: true,
      model: continuationResult.model || "",
      degraded: false,
      reason: "",
      continuations: continuationResult.continuations,
      contentComplete: continuationResult.complete
    }
  };

  return response;
}
