import type { Project } from "../../domain/workspace/projectTypes";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse } from "../../domain/workspace/types";
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { runWithContinuation } from "./agentContinuation";
import { loadAgentPromptTemplate } from "./agentAssetRegistry";
import { dedupeActions, parseRecentSuggestedActions } from "./workspaceCoachReplyGuard";
import { normalizeIterationMessageContent } from "./workspaceMessageSanitizer";
import { normalizeIteration } from "./workspaceSupport";
import {
  isRequirementChangeMessage
} from "./workspaceCoachImpactAssessment";
import { pickString } from "../../shared/utils";
import { handlePendingGitRequirementIntake } from "./workspaceServiceCoachGitIntakeOps";
import { handleCoachPeriodicRepositorySync } from "./workspaceServiceCoachRepositorySyncOps";
import { buildOpenclawSkillSelectionContext, runOpenclawSkillChainForCoach } from "./workspaceOpenclawSkillsBridge";
import { buildKnowledgeSyncContext } from "./knowledgeSyncService";
import { buildCoachContractContext } from "./workspaceCoachInteractionContract";
import { buildUpstreamExcerpts, formatUpstreamContext } from "./artifactDependencyGraph";
import { publishArtifactReferenceMessage } from "./workspaceArtifactConversationPolicy";
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
    "输出格式：",
    "先用自然语言直接回复用户——这部分用户会完整看到，所以要自然、有温度、有针对性。",
    "然后在回复的最末尾，另起一行用 HTML 注释附带结构化控制信息（用户看不到这部分）：",
    '<!-- coach:{"intent":"意图标签","execution":{"action":"none|rewrite|confirm-accurate|confirm-inaccurate|enter-clarify-mode|run-full-cycle","instruction":"执行指令","apply":false,"artifacts":[]},"guidance":{"uploadRecommended":false,"suggestedUploadTypes":[],"suggestedActions":[],"clarificationChecklist":[]}} -->',
    "",
    "execution.artifacts 说明：",
    "当你认为当前对话已经产出了足够信息来生成某个交付物时，在 artifacts 数组中声明交付物 id。系统会自动触发交付物草稿合成并在对话中显示卡片。",
    "可用的交付物 id：analysis-report, product-requirements-doc, boundary-confirmation, prototype-preview, design-spec, technical-architecture, api-specification, database-design, frontend-code, backend-code, test-matrix, acceptance-checklist, release-review, deployment-plan, delivery-package",
    "大多数情况 artifacts 为空数组。只有当你判断信息充足、用户意图明确时才声明。",
    "",
    "完整示例：",
    "---",
    "退款功能确实需要做，不过我建议我们先聊清楚几个关键点：退款触发的条件是什么？是用户手动发起还是系统自动判定？另外退款金额的计算规则需要确认——是全额退还是按比例？",
    "",
    "这些搞清楚之后，我再帮你拆解任务优先级。如果你有相关的业务文档或流程图，先传上来我看看。",
    '<!-- coach:{"intent":"clarify","execution":{"action":"none","instruction":"","apply":false,"artifacts":[]},"guidance":{"uploadRecommended":true,"suggestedUploadTypes":["业务流程文档"],"suggestedActions":["确认退款触发条件","确认退款金额计算规则"],"clarificationChecklist":["退款是用户发起还是系统自动","退款金额是全额还是按比例"]}} -->',
    "---",
    "",
    "intent 可选值：collect-attachment / clarify / confirm-boundary / plan / qa / release / full-cycle / general",
    "execution.action 绝大多数情况用 none，只有用户明确要求执行操作时才用其他值。",
    "注意：自然语言回复部分不要包含任何 JSON、markdown 标记或结构化格式。coach 标记必须在回复最后一行，独占一行。"
  ].join("\n"),
  userPrompt: [
    "用户说：{{message}}",
    "",
    "当前情况：",
    "{{context}}",
    "",
    "请先用自然语言回复用户，然后在末尾附带 <!-- coach:{...} --> 控制标记。"
  ].join("\n")
};

function loadCoachPromptTemplate(): CoachPromptTemplate {
  return loadAgentPromptTemplate("iteration-coach", coachPromptFallback);
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => vars[key] ?? "");
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

// 标准形式：<!-- coach:{...} -->
// 容错：大小写、多余空格、换行嵌入、未闭合注释
const COACH_MARKER_PATTERNS = [
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*-->/i,
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*$/i  // 未闭合的 -->（LLM截断时可能丢失闭合标签）
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
    const markerJson = safeJsonParse(extracted.json);
    return { reply, marker: markerJson };
  }

  // Fallback 1: LLM 返回了整个 JSON 对象（旧格式兼容）
  const parsed = safeJsonParse(rawContent);
  if (parsed && typeof parsed.reply === "string") {
    return { reply: parsed.reply, marker: parsed };
  }

  // Fallback 2: LLM 返回了 code fence 包裹的 JSON（某些模型习惯）
  const fenceMatch = rawContent.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/);
  if (fenceMatch) {
    const fenceParsed = safeJsonParse(fenceMatch[1]!);
    if (fenceParsed && typeof fenceParsed.reply === "string") {
      const textBefore = rawContent.slice(0, rawContent.indexOf(fenceMatch[0])).trim();
      return { reply: textBefore || fenceParsed.reply, marker: fenceParsed };
    }
  }

  // Fallback 3: 纯自然语言（无任何结构化标记）— 完全可用，只是没有控制信息
  return { reply: rawContent.trim(), marker: null };
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
  let text = reply;
  // Strip model-internal tool call / thinking blocks
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

function summarizeProjectKnowledge(project: Project | null): string[] {
  const context = buildKnowledgeSyncContext(project?.knowledgeBase ?? null);
  if (context) {
    return [context];
  }
  return ["这个项目还没有积累业务知识，需要通过分析材料来逐步沉淀。"];
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

const ARTIFACT_KEYWORD_MAP: Record<string, string[]> = {
  "analysis-report": ["分析报告", "需求分析", "analysis report"],
  "product-requirements-doc": ["需求文档", "PRD", "产品需求", "requirements"],
  "boundary-confirmation": ["边界确认", "边界", "boundary"],
  "prototype-preview": ["原型", "prototype", "交互原型"],
  "design-spec": ["设计规范", "design spec", "视觉规范"],
  "technical-architecture": ["技术架构", "架构", "architecture"],
  "api-specification": ["接口设计", "API", "接口文档", "api spec"],
  "database-design": ["数据库", "数据模型", "表结构", "database"],
  "frontend-code": ["前端代码", "前端", "frontend", "React"],
  "backend-code": ["后端代码", "后端", "backend"],
  "test-matrix": ["测试矩阵", "测试", "test matrix"],
  "acceptance-checklist": ["验收清单", "验收", "acceptance"],
  "release-review": ["发布评审", "发布", "release review"],
  "deployment-plan": ["部署方案", "部署", "deployment"],
  "delivery-package": ["交付归档", "归档", "delivery"]
};

function inferTargetArtifact(userMessage: string): string | null {
  const msg = userMessage.toLowerCase();
  for (const [artifactId, keywords] of Object.entries(ARTIFACT_KEYWORD_MAP)) {
    if (keywords.some((kw) => msg.includes(kw.toLowerCase()))) {
      return artifactId;
    }
  }
  return null;
}

function buildArtifactUpstreamContextForCoach(iteration: Iteration, userMessage: string): string {
  const targetArtifactId = inferTargetArtifact(userMessage);
  if (!targetArtifactId) return "";
  const items = iteration.changeControl?.artifactWorkflow?.items ?? [];
  if (items.length === 0) return "";
  const excerpts = buildUpstreamExcerpts(targetArtifactId, items);
  if (excerpts.length === 0) return "";
  return formatUpstreamContext(excerpts);
}

function buildInheritedBaselineContext(iteration: Iteration, previous: Iteration | null): string[] {
  if (!previous) return [];
  const parts: string[] = [];
  // 继承元信息
  const continuity = iteration.continuity;
  if (continuity) {
    if (continuity.inheritedSummary) {
      parts.push(`继承说明：${continuity.inheritedSummary}`);
    }
    if (continuity.carriedGoals.length > 0) {
      parts.push(`继承目标：${continuity.carriedGoals.join("、")}。`);
    }
    if (continuity.carriedRisks.length > 0) {
      parts.push(`继承风险：${continuity.carriedRisks.join("、")}。`);
    }
    if (continuity.carriedDecisions.length > 0) {
      parts.push(`继承决策：${continuity.carriedDecisions.join("、")}。`);
    }
  }
  // 前序迭代范围
  if (previous.scope?.inScope?.length > 0) {
    parts.push(`上一版范围：${previous.scope.inScope.join("、")}。`);
  }
  // 前序迭代已确认交付物摘要（核心：让 LLM 自动获得 V1 基线）
  const prevWorkflow = previous.changeControl?.artifactWorkflow;
  if (prevWorkflow?.items) {
    const committed = prevWorkflow.items.filter((item: { outputVersion: number }) => item.outputVersion > 0);
    if (committed.length > 0) {
      const PER_ARTIFACT_BUDGET = committed.length >= 10 ? 120 : 200;
      const summaries = committed.map((item: { title: string; summary: string; draft?: { content?: string } }) => {
        const text = item.summary || item.draft?.content || "";
        return `- 【${item.title}】${text.slice(0, PER_ARTIFACT_BUDGET)}`;
      });
      parts.push(
        `上一版「${previous.name}」已交付 ${committed.length} 项成果（自动继承，无需用户提供）：\n${summaries.join("\n")}`
      );
    }
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
    ...buildInheritedBaselineContext(iteration, previous),
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
    project?.repository?.url
      ? `项目已配置代码仓库（${project.repository.url}，分支 ${project.repository.defaultBranch || "main"}），如果需要可以引导用户决定是否读取仓库来辅助需求分析。`
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
    buildCoachContractContext(!previous),
    buildArtifactUpstreamContextForCoach(iteration, userMessage)
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
      reply: `这一步暂时走不通——${gate.reason}。先把前置的事情搞定我们再继续。`,
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

  const context = [
    buildCoachContext(normalized, previous ? normalizeIteration(previous) : null, project ?? null, message),
    requiresImpactAssessment
      ? "重要：用户正在提出新增或修改需求。在回复中先聊清楚这个变更可能影响哪些业务流程、功能模块和规则，说清楚你已知的和待确认的，不要反过来问用户「你觉得影响了什么」。"
      : "",
    recentMessages.length > 0
      ? `最近的对话：\n${recentMessages.map((item, idx) => `  ${idx + 1}. ${item.role === "user" ? "用户" : "教练"}：${item.content.slice(0, 400).replace(/\s+/g, " ")}`).join("\n")}`
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
    expectedOutput: "先用自然语言直接回复用户，最后一行附带 <!-- coach:{...} --> 结构化标记",
    systemPrompt: renderTemplate(promptTemplate.systemPrompt, {
      role: "iteration-coach",
      scope: "iteration",
      goal: "用自然沟通引导用户推进迭代澄清与边界确认",
      context
    }),
    userPrompt: renderTemplate(promptTemplate.userPrompt, {
      message,
      role: "iteration-coach",
      scope: "iteration",
      goal: "用自然沟通引导用户推进迭代澄清与边界确认",
      context
    })
  };

  try {
    const continuationResult = await runWithContinuation(agentRunner, prompt, {
      sessionContext: {
        projectId: normalized.projectId,
        iterationId: normalized.id
      }
    }, { maxContinuations: 2 });
    const result = {
      content: continuationResult.content,
      model: continuationResult.model,
      continuations: continuationResult.continuations,
      contentComplete: continuationResult.complete
    };
    const { reply: extractedReply, marker } = extractCoachMarker(result.content);
    const parsed = marker;
    const modelIntent = pickString(parsed?.intent) as IterationCoachChatResponse["intent"];
    const guidance = (parsed?.guidance ?? {}) as Record<string, unknown>;
    const generatedReply = extractedReply || buildFallbackCoachReply(result.content);
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
        : [];
    const reply = generatedReply;
    const replyWithAssessment = reply;
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
        reason: "",
        continuations: result.continuations,
        contentComplete: result.contentComplete
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
    // Coach 声明的交付物产出 → 发布交付物引用消息到对话流
    const declaredArtifacts = pickStringList(executionRaw.artifacts, 5);
    if (declaredArtifacts.length > 0) {
      const workflow = normalized.changeControl?.artifactWorkflow;
      if (workflow) {
        for (const artifactId of declaredArtifacts) {
          const item = workflow.items.find((i) => i.id === artifactId);
          if (item) {
            publishArtifactReferenceMessage(repo, iterationId, {
              title: item.title,
              summary: item.summary || item.description,
              evidence: item.evidence || [],
              prompt: `请围绕交付物「${item.title}」继续与用户确认，不要直接跨阶段推进。`
            });
          }
        }
      }
    }

    // 消息持久化由前端统一负责（前端在发送前和收到回复后分别 POST /messages）
    // 后端 Coach 流程不再重复持久化，避免消息重复
    return response;
  } catch (error) {
    if (error instanceof LlmInvocationError) {
      throw error;
    }
    throw new LlmInvocationError(error instanceof Error ? error.message : "coach_llm_error");
  }
}
