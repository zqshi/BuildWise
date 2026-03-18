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
    "你是 BuildWise 的迭代教练。你的角色像一位经验丰富的项目经理和业务顾问——你理解技术，但始终站在业务视角与用户沟通。",
    "",
    "沟通风格：",
    "- 用自然、口语化的中文对话，像同事间的讨论，不要像机器在汇报",
    "- 直接回应用户的问题和关切，不要复述用户说的话",
    "- 给建议时说清楚「为什么」，而不是只列清单",
    "- 用业务语言而非技术术语——说「订单流程」而不是「order-service API endpoint」",
    "- 如果要提到多个事项，用简短的自然段落，不要用编号列表或结构化输出",
    "- 语气专业但不刻板，可以适当表达态度（比如「这个改动范围有点大，我建议我们先聊清楚优先级」）",
    "",
    "你的职责：",
    "- 引导用户把需求说清楚、材料补齐全",
    "- 当信息不足时，主动提出关键问题而不是被动等待",
    "- 当用户提出变更时，先评估影响再给建议",
    "- 推进迭代向前走，但不催促——节奏由用户把控",
    "",
    "输出格式要求：你的回复必须是合法 JSON，包含 intent、reply、execution、guidance 四个字段。",
    "其中 reply 字段是用户直接看到的对话内容，必须是自然流畅的中文，不含任何 JSON/markdown 标记。"
  ].join("\n"),
  userPrompt: [
    "用户说：{{message}}",
    "",
    "当前情况：",
    "{{context}}",
    "",
    "请以合法 JSON 回复，格式：{{expectedOutput}}",
    "注意：reply 字段写给用户看，要自然、有温度、有针对性。"
  ].join("\n")
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
    return ["这个项目还没有积累业务知识，需要通过分析材料来逐步沉淀。"];
  }
  const parts: string[] = [];
  const terms = knowledge.ontologyTerms.slice(0, 6);
  if (terms.length > 0) {
    parts.push(`项目中的关键业务概念：${terms.map((item) => item.term + (item.aliases.length > 0 ? `（也叫${item.aliases.join("、")}）` : "")).join("、")}`);
  }
  const rules = knowledge.stableRules.slice(0, 6);
  if (rules.length > 0) {
    parts.push(`已确认的业务规则：${rules.map((item) => item.rule).join("；")}`);
  }
  const components = knowledge.componentInventory.slice(0, 6);
  if (components.length > 0) {
    parts.push(`涉及的功能模块：${components.map((item) => item.component).join("、")}`);
  }
  const patterns = knowledge.changePatterns.slice(0, 4);
  if (patterns.length > 0) {
    parts.push(`常见变更模式：${patterns.map((item) => item.pattern).join("、")}`);
  }
  return parts.length > 0 ? parts : ["项目知识库已初始化但暂无具体条目。"];
}

function summarizeChangeIntelligence(iteration: Iteration) {
  const cc = iteration.changeControl;
  const parts: string[] = [];
  if (cc?.changeSource?.type && cc.changeSource.type !== "unknown") {
    const typeLabel = cc.changeSource.type === "document" ? "上传的文档" : cc.changeSource.type === "html" ? "网页内容" : cc.changeSource.type === "image" ? "截图/图片" : cc.changeSource.type;
    parts.push(`变更来源是${typeLabel}`);
  }
  if (cc?.changeSource?.rawInput) {
    parts.push(`原始输入摘要：${cc.changeSource.rawInput.slice(0, 120)}`);
  }
  const hits = cc?.knowledgeHits ?? [];
  if (hits.length > 0) {
    parts.push(`与已有知识的关联：${hits.join("、")}`);
  }
  const conflicts = cc?.knowledgeConflicts ?? [];
  if (conflicts.length > 0) {
    parts.push(`发现的知识冲突：${conflicts.join("、")}`);
  }
  const fps = cc?.normalizedFunctionalPoints ?? [];
  if (fps.length > 0) {
    parts.push(`归纳出的功能点：${fps.join("、")}`);
  }
  return parts;
}

function buildCoachContext(iteration: Iteration, previous: Iteration | null, project: Project | null, userMessage: string) {
  const boundary = iteration.changeControl?.boundary;
  const unresolved = iteration.changeControl?.lastClarificationResolution?.unresolvedQuestions ?? [];
  const statusLabel =
    iteration.status === "planned"
      ? "规划阶段"
      : iteration.status === "in-progress"
        ? "执行中"
        : iteration.status === "review"
          ? "评审阶段"
          : iteration.status === "blocked"
            ? "遇阻"
            : "收尾交付";
  const contextParts = [
    `当前迭代「${iteration.name}」处于${statusLabel}，进度 ${iteration.progress}。${previous ? `上一轮迭代是「${previous.name}」。` : "这是第一轮迭代。"}`,
    iteration.scope.inScope.length > 0
      ? `本轮范围包括：${iteration.scope.inScope.join("、")}。`
      : "",
    iteration.scope.outOfScope.length > 0
      ? `明确不做的：${iteration.scope.outOfScope.join("、")}。`
      : "",
    iteration.scope.acceptanceCriteria.length > 0
      ? `验收标准：${iteration.scope.acceptanceCriteria.join("；")}。`
      : "",
    iteration.changeControl?.lastAnalysisAt
      ? `最近一次材料分析在 ${iteration.changeControl.lastAnalysisAt}。`
      : "用户还没有上传过材料。",
    iteration.changeControl?.pendingHumanConfirmation
      ? "有待用户确认的事项。"
      : "",
    unresolved.length > 0
      ? `还有未解决的澄清问题：${unresolved.join("；")}。`
      : "",
    boundary && boundary.requirementRefs.length > 0
      ? `变更边界涉及需求：${boundary.requirementRefs.join("、")}。`
      : "",
    ...summarizeProjectKnowledge(project),
    ...summarizeChangeIntelligence(iteration),
    buildOpenclawSkillSelectionContext({
      iteration,
      project,
      previousIterationName: previous?.name || "",
      userMessage
    }),
    buildCoachContractContext(!previous)
  ];
  return contextParts.filter(Boolean).join("\n");
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
    'JSON 格式：{intent: 意图标签, reply: "给用户的自然语言回复（不要有任何标记语法）", execution:{action,instruction,apply}, guidance:{uploadRecommended, suggestedUploadTypes[], suggestedActions[], clarificationChecklist[]}}';
  const context = [
    buildCoachContext(normalized, previous ? normalizeIteration(previous) : null, project ?? null, message),
    requiresImpactAssessment
      ? "重要：用户正在提出新增或修改需求。在 reply 中先聊清楚这个变更可能影响哪些业务流程、功能模块和规则，说清楚你已知的和待确认的，不要反过来问用户「你觉得影响了什么」。"
      : "",
    recentMessages.length > 0
      ? `最近的对话：\n${recentMessages.map((item, idx) => `  ${idx + 1}. ${item.role === "user" ? "用户" : "教练"}：${item.content.slice(0, 120).replace(/\s+/g, " ")}`).join("\n")}`
      : "",
    recentSuggestedActions.length > 0
      ? `上轮已建议的行动（避免重复）：${recentSuggestedActions.join("、")}`
      : ""
  ].filter(Boolean).join("\n\n");
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
    const result = await agentRunner.run(prompt, {
      sessionContext: {
        projectId: normalized.projectId,
        iterationId: normalized.id
      }
    });
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
