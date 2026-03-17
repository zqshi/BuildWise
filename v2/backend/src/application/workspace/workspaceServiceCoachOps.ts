import type { Project } from "../../domain/workspace/projectTypes";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse } from "../../domain/workspace/types";
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { loadAgentPromptTemplate } from "./agentAssetRegistry";
import { dedupeActions, isMechanicalSimilarReply, parseRecentSuggestedActions } from "./workspaceCoachReplyGuard";
import { normalizeIterationMessageContent } from "./workspaceMessageSanitizer";
import { normalizeIteration } from "./workspaceSupport";
import {
  buildImpactAssessmentFallbackReply,
  hasImpactAssessmentReply,
  isRequirementChangeMessage
} from "./workspaceCoachImpactAssessment";
import { handlePendingGitRequirementIntake } from "./workspaceServiceCoachGitIntakeOps";
import { handleCoachPeriodicRepositorySync } from "./workspaceServiceCoachRepositorySyncOps";
import { buildOpenclawSkillSelectionContext, runOpenclawSkillChainForCoach } from "./workspaceOpenclawSkillsBridge";
import { buildCoachContractContext } from "./workspaceCoachInteractionContract";
import { safeJsonParse } from "./workspaceServiceAttachmentUtils";
import {
  appendPolicyExecutionLogOp,
  evaluatePolicyGateForCoachOp,
  getEffectiveOrchestrationPolicyForProjectOp
} from "./workspaceServicePolicyOps";

type CoachPromptTemplate = {
  systemPrompt: string;
  userPrompt: string;
};

const coachPromptFallback: CoachPromptTemplate = {
  systemPrompt: [
    "你是 BuildWise 的迭代教练（iteration-coach）。",
    "你的目标是通过自然沟通引导用户补齐信息、上传材料并推进迭代。",
    "你必须输出 JSON，不要输出 markdown。"
  ].join("\n"),
  userPrompt: [
    "用户消息：{{message}}",
    "上下文：{{context}}",
    "请输出：{{expectedOutput}}"
  ].join("\n\n")
};

function loadCoachPromptTemplate(): CoachPromptTemplate {
  return loadAgentPromptTemplate("iteration-coach", coachPromptFallback);
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => vars[key] ?? "");
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickStringList(value: unknown, max = 8) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function buildFallbackCoachReply(rawContent: string) {
  const text = rawContent.trim();
  if (!text) {
    return "";
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    return "";
  }
  return text;
}

function stripInternalSkillNotes(reply: string) {
  return reply
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[skills\]/i.test(line.trim()))
    .join("\n")
    .trim();
}

function inferIntent(iteration: Iteration, message: string): IterationCoachChatResponse["intent"] {
  const text = message.toLowerCase();
  const pendingQuestions = iteration.changeControl?.clarificationQuestions ?? [];
  if (!iteration.changeControl?.lastAnalysisAt) {
    return "collect-attachment";
  }
  if (pendingQuestions.length > 0 || iteration.changeControl?.pendingHumanConfirmation) {
    return "clarify";
  }
  if (/边界|boundary|白名单|范围/.test(text)) {
    return "confirm-boundary";
  }
  if (/测试|验收|回归|qa/.test(text)) {
    return "qa";
  }
  if (/发布|上线|回滚|release|deploy/.test(text)) {
    return "release";
  }
  if (/闭环|全流程|端到端|一键跑完|full[\s-]?cycle/.test(text)) {
    return "full-cycle";
  }
  if (/计划|拆解|任务|排期|实现/.test(text)) {
    return "plan";
  }
  return "general";
}

function summarizeProjectKnowledge(project: Project | null) {
  const knowledge = project?.knowledgeBase;
  if (!knowledge) {
    return [
      "项目知识.ontologyTerms=-",
      "项目知识.stableRules=-",
      "项目知识.componentInventory=-",
      "项目知识.changePatterns=-"
    ];
  }
  return [
    `项目知识.ontologyTerms=${knowledge.ontologyTerms
      .slice(0, 6)
      .map((item) => `${item.term}${item.aliases.length > 0 ? `(${item.aliases.join("/")})` : ""}`)
      .join(" | ") || "-"}`,
    `项目知识.stableRules=${knowledge.stableRules
      .slice(0, 6)
      .map((item) => item.rule)
      .join(" | ") || "-"}`,
    `项目知识.componentInventory=${knowledge.componentInventory
      .slice(0, 6)
      .map((item) => item.component)
      .join(" | ") || "-"}`,
    `项目知识.changePatterns=${knowledge.changePatterns
      .slice(0, 6)
      .map((item) => item.pattern)
      .join(" | ") || "-"}`
  ];
}

function summarizeChangeIntelligence(iteration: Iteration) {
  const changeControl = iteration.changeControl;
  return [
    `变更来源.type=${changeControl?.changeSource?.type || "unknown"}`,
    `变更来源.rawInput=${changeControl?.changeSource?.rawInput || "-"}`,
    `变更来源.attachments=${changeControl?.changeSource?.attachments?.join(" | ") || "-"}`,
    `变更来源.references=${changeControl?.changeSource?.references?.join(" | ") || "-"}`,
    `项目知识命中=${changeControl?.knowledgeHits?.join(" | ") || "-"}`,
    `项目知识冲突=${changeControl?.knowledgeConflicts?.join(" | ") || "-"}`,
    `功能点归一化=${changeControl?.normalizedFunctionalPoints?.join(" | ") || "-"}`,
    `映射审计=${changeControl?.mappingAuditTrail
      ?.slice(0, 8)
      .map(
        (item) =>
          `${item.functionalPoint}=>需求[${item.requirementRefs.join(",") || "-"}];组件[${item.componentRefs.join(",") || "-"}];代码[${item.codePaths.join(",") || "-"}]`
      )
      .join(" | ") || "-"}`
  ];
}

function buildCoachContext(iteration: Iteration, previous: Iteration | null, project: Project | null, userMessage: string) {
  const boundary = iteration.changeControl?.boundary;
  const unresolved = iteration.changeControl?.lastClarificationResolution?.unresolvedQuestions ?? [];
  const statusHint =
    iteration.status === "planned"
      ? "planning"
      : iteration.status === "in-progress"
        ? "execution"
        : iteration.status === "review"
          ? "review"
          : iteration.status === "blocked"
            ? "risk-control"
            : "delivery-close";
  return [
    `迭代=${iteration.name};状态=${iteration.status};进度=${iteration.progress}`,
    `基线=${previous?.name ?? "无"}`,
    `阶段提示=${statusHint}`,
    `用户消息=${userMessage}`,
    `范围inScope=${iteration.scope.inScope.join(" | ") || "-"}`,
    `范围outOfScope=${iteration.scope.outOfScope.join(" | ") || "-"}`,
    `验收标准=${iteration.scope.acceptanceCriteria.join(" | ") || "-"}`,
    `分析时间=${iteration.changeControl?.lastAnalysisAt || "none"}`,
    `待确认=${iteration.changeControl?.pendingHumanConfirmation ? "yes" : "no"}`,
    `未解决澄清=${unresolved.join(" | ") || "-"}`,
    `边界.requirementRefs=${boundary?.requirementRefs.join(" | ") || "-"}`,
    `边界.componentRefs=${boundary?.componentRefs.join(" | ") || "-"}`,
    `边界.codePaths=${boundary?.codePaths.join(" | ") || "-"}`,
    ...summarizeProjectKnowledge(project),
    ...summarizeChangeIntelligence(iteration),
    buildOpenclawSkillSelectionContext({
      iteration,
      project,
      previousIterationName: previous?.name || "",
      userMessage
    }),
    buildCoachContractContext(!previous)
  ].join("\n");
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
  const recentMessages = repo
    .listMessages(iterationId)
    .slice(-8)
    .map((item) => ({ role: item.role, content: normalizeIterationMessageContent(item.role, item.content) }));
  const recentAssistantReply = [...recentMessages].reverse().find((item) => item.role === "assistant")?.content || "";
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);
  const intent = inferIntent(normalized, message);
  const requiresImpactAssessment = isRequirementChangeMessage(message);
  const promptTemplate = loadCoachPromptTemplate();
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
  if (gate.blocked) {
    if (activePolicy) {
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
    return {
      iterationId: normalized.id,
      intent: "clarify",
      reply: `当前策略阻断：${gate.reason}。请先完成前置确认后再继续。`,
      execution: {
        action: "none",
        instruction: "",
        apply: false
      },
      guidance: {
        uploadRecommended: false,
        suggestedUploadTypes: [],
        suggestedActions: gate.requiredActions.length > 0 ? gate.requiredActions : ["请先补齐前置确认"],
        clarificationChecklist: [gate.reason]
      },
      llm: {
        used: false,
        model: "policy-guard",
        degraded: false,
        reason: "policy_blocked"
      }
    };
  }
  const skillChain = runOpenclawSkillChainForCoach({
    iteration: normalized,
    project: project ?? null,
    previousIterationName: previous?.name || "",
    userMessage: message
  });

  if (!agentRunner) {
    throw new LlmUnavailableError(skillChain.error || "openclaw_runtime_unavailable");
  }

  const expectedOutput =
    "JSON: {intent, reply, execution:{action,instruction,apply}, guidance:{uploadRecommended, suggestedUploadTypes[], suggestedActions[], clarificationChecklist[]}}";
  const context = [
    buildCoachContext(normalized, previous ? normalizeIteration(previous) : null, project ?? null, message),
    requiresImpactAssessment
      ? "本轮要求=用户正在提出新增/修改需求。reply 首段必须先给出影响评估，至少覆盖受影响页面/组件/接口/代码边界/业务规则风险中的已知项，并明确待确认点；不要要求用户自己先说明影响是什么。"
      : "本轮要求=按自然沟通推进迭代。",
    `recent_messages=${recentMessages
      .map((item, idx) => `[${idx + 1}]${item.role}:${item.content.slice(0, 120).replace(/\s+/g, " ")}`)
      .join(" | ") || "-"}`,
    `recent_suggested_actions=${recentSuggestedActions.join(" | ") || "-"}`
  ].join("\n");
  const prompt = {
    agentId: "agent-iteration-coach-1",
    role: "iteration-coach" as const,
    scope: "iteration" as const,
    goal: "用自然沟通引导用户推进迭代澄清与边界确认",
    expectedOutput,
    systemPrompt: renderTemplate(promptTemplate.systemPrompt, {
      role: "iteration-coach",
      scope: "iteration",
      goal: "用自然沟通引导用户推进迭代澄清与边界确认",
      context,
      expectedOutput
    }),
    userPrompt: renderTemplate(promptTemplate.userPrompt, {
      message,
      role: "iteration-coach",
      scope: "iteration",
      goal: "用自然沟通引导用户推进迭代澄清与边界确认",
      context,
      expectedOutput
    })
  };

  try {
    const result = await agentRunner.run(prompt);
    const parsed = safeJsonParse(result.content);
    const modelIntent = pickString(parsed?.intent) as IterationCoachChatResponse["intent"];
    const guidance = (parsed?.guidance ?? {}) as Record<string, unknown>;
    const generatedReply = pickString(parsed?.reply) || buildFallbackCoachReply(result.content);
    if (!generatedReply) {
      throw new LlmInvocationError("Coach LLM returned invalid payload: missing reply");
    }
    const suggestedUploadTypes = pickStringList(guidance.suggestedUploadTypes, 6);
    const suggestedActionsRaw = pickStringList(guidance.suggestedActions, 8);
    const clarificationChecklist = pickStringList(guidance.clarificationChecklist, 8);
    const executionRaw = (parsed?.execution ?? {}) as Record<string, unknown>;
    const actionRaw = pickString(executionRaw.action);
    const validActionSet = new Set<NonNullable<IterationCoachChatResponse["execution"]>["action"]>([
      "none",
      "rewrite",
      "confirm-accurate",
      "confirm-inaccurate",
      "enter-clarify-mode",
      "run-full-cycle"
    ]);
    const executionAction: NonNullable<IterationCoachChatResponse["execution"]>["action"] = validActionSet.has(
      actionRaw as NonNullable<IterationCoachChatResponse["execution"]>["action"]
    )
      ? (actionRaw as NonNullable<IterationCoachChatResponse["execution"]>["action"])
      : "none";
    const executionInstruction = pickString(executionRaw.instruction);
    const executionApply = Boolean(executionRaw.apply);
    const fallbackSuggestedActions =
      skillChain.suggestedActions.length > 0
        ? skillChain.suggestedActions
        : ["继续当前交付物确认，再推进下一阶段"];
    const reply = isMechanicalSimilarReply(generatedReply, recentAssistantReply)
      ? `我理解你的关注点。基于当前迭代「${normalized.name}」，我们先推进一个最关键动作：${
          (normalized.changeControl?.clarificationQuestions ?? [])[0] || "确认本轮边界与验收口径"
        }。`
      : generatedReply;
    const replyWithAssessment =
      requiresImpactAssessment && !hasImpactAssessmentReply(reply)
        ? `${buildImpactAssessmentFallbackReply(normalized)}\n\n${reply}`
        : reply;
    const validIntentSet = new Set<IterationCoachChatResponse["intent"]>([
      "collect-attachment",
      "clarify",
      "confirm-boundary",
      "plan",
      "qa",
      "release",
      "full-cycle",
      "general"
    ]);
    const finalIntent = validIntentSet.has(modelIntent) ? modelIntent : intent;
    const skillActions = dedupeActions(skillChain.suggestedActions, recentSuggestedActions);
    const mergedActions = dedupeActions(
      [...(suggestedActionsRaw.length > 0 ? suggestedActionsRaw : fallbackSuggestedActions), ...skillActions],
      recentSuggestedActions
    );
    const mergedChecklist = Array.from(new Set([...(clarificationChecklist || []), ...skillChain.checklist])).slice(0, 8);
    const response: IterationCoachChatResponse = {
      iterationId: normalized.id,
      intent: finalIntent,
      reply: stripInternalSkillNotes(replyWithAssessment),
      execution: {
        action: executionAction,
        instruction: executionInstruction,
        apply: executionApply
      },
      guidance: {
        uploadRecommended: Boolean(guidance.uploadRecommended),
        suggestedUploadTypes,
        suggestedActions: mergedActions,
        clarificationChecklist: mergedChecklist
      },
      llm: {
        used: true,
        model: result.model || "",
        degraded: false,
        reason: ""
      }
    };
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
    return response;
  } catch (error) {
    if (error instanceof LlmInvocationError) {
      throw error;
    }
    throw new LlmInvocationError(error instanceof Error ? error.message : "coach_llm_error");
  }
}
