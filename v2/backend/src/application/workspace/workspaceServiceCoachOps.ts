import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse } from "../../domain/workspace/types";
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { normalizeIteration } from "./workspaceSupport";

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

function parsePromptTemplate(content: string): CoachPromptTemplate | null {
  const lower = content.toLowerCase();
  const systemStart = lower.indexOf("# system");
  const userStart = lower.indexOf("# user");
  if (systemStart < 0 || userStart < 0 || userStart <= systemStart) {
    return null;
  }
  const systemPrompt = content.slice(systemStart + "# system".length, userStart).trim();
  const userPrompt = content.slice(userStart + "# user".length).trim();
  if (!systemPrompt || !userPrompt) {
    return null;
  }
  return { systemPrompt, userPrompt };
}

function loadCoachPromptTemplate(): CoachPromptTemplate {
  const candidates = [
    resolve(process.cwd(), "prompts", "agent.iteration-coach.v2.md"),
    resolve(process.cwd(), "prompts", "agent.iteration-coach.v1.md")
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = parsePromptTemplate(raw);
      if (parsed) {
        return parsed;
      }
    } catch {
      // keep fallback
    }
  }
  return coachPromptFallback;
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => vars[key] ?? "");
}

function safeJsonParse(value: string) {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
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

function parseRecentSuggestedActions(messages: Array<{ role: string; content: string }>) {
  const actions: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "system") {
      continue;
    }
    if (msg.content.startsWith("操作建议：")) {
      const parsed = msg.content
        .replace(/^操作建议：/, "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean);
      actions.push(...parsed);
      continue;
    }
    if (msg.content.startsWith("操作建议JSON:")) {
      const raw = msg.content.replace(/^操作建议JSON:/, "").trim();
      try {
        const data = JSON.parse(raw) as { actions?: unknown };
        if (Array.isArray(data.actions)) {
          actions.push(
            ...data.actions
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          );
        }
      } catch {
        // ignore parse error
      }
    }
  }
  return Array.from(new Set(actions));
}

function dedupeActions(current: string[], recent: string[]) {
  const recentSet = new Set(recent.map((item) => item.trim()).filter(Boolean));
  const result = current.filter((item) => !recentSet.has(item));
  return result.length > 0 ? result : current;
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：,.!?;:]/g, "")
    .trim();
}

function calcOverlapRatio(a: string, b: string) {
  if (!a || !b) {
    return 0;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let hit = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) {
      hit += 1;
    }
  }
  return hit / Math.max(1, shorter.length);
}

function isMechanicalSimilarReply(current: string, previous: string) {
  const a = normalizeForCompare(current);
  const b = normalizeForCompare(previous);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return calcOverlapRatio(a, b) >= 0.86;
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
  if (/计划|拆解|任务|排期|实现/.test(text)) {
    return "plan";
  }
  return "general";
}

function buildCoachContext(iteration: Iteration, previous: Iteration | null, userMessage: string) {
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
    `边界.codePaths=${boundary?.codePaths.join(" | ") || "-"}`
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
    .map((item) => ({ role: item.role, content: item.content.trim() }));
  const recentAssistantReply = [...recentMessages].reverse().find((item) => item.role === "assistant")?.content || "";
  const recentSuggestedActions = parseRecentSuggestedActions(recentMessages);
  const intent = inferIntent(normalized, message);
  const promptTemplate = loadCoachPromptTemplate();

  if (!agentRunner) {
    throw new LlmUnavailableError("Coach LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL).");
  }

  const expectedOutput =
    "JSON: {intent, reply, guidance:{uploadRecommended, suggestedUploadTypes[], suggestedActions[], clarificationChecklist[]}}";
  const context = [
    buildCoachContext(normalized, previous ? normalizeIteration(previous) : null, message),
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
    const generatedReply = pickString(parsed?.reply);
    if (!generatedReply) {
      throw new LlmInvocationError("Coach LLM returned invalid payload: missing reply");
    }
    const suggestedUploadTypes = pickStringList(guidance.suggestedUploadTypes, 6);
    const suggestedActionsRaw = pickStringList(guidance.suggestedActions, 8);
    const clarificationChecklist = pickStringList(guidance.clarificationChecklist, 8);
    if (suggestedActionsRaw.length === 0) {
      throw new LlmInvocationError("Coach LLM returned invalid payload: missing guidance.suggestedActions");
    }
    const reply = isMechanicalSimilarReply(generatedReply, recentAssistantReply)
      ? `我理解你的关注点。基于当前迭代「${normalized.name}」，我们先推进一个最关键动作：${
          (normalized.changeControl?.clarificationQuestions ?? [])[0] || "确认本轮边界与验收口径"
        }。`
      : generatedReply;
    const validIntentSet = new Set<IterationCoachChatResponse["intent"]>([
      "collect-attachment",
      "clarify",
      "confirm-boundary",
      "plan",
      "qa",
      "release",
      "general"
    ]);
    const finalIntent = validIntentSet.has(modelIntent) ? modelIntent : intent;
    return {
      iterationId: normalized.id,
      intent: finalIntent,
      reply,
      guidance: {
        uploadRecommended: Boolean(guidance.uploadRecommended),
        suggestedUploadTypes,
        suggestedActions:
          dedupeActions(suggestedActionsRaw, recentSuggestedActions),
        clarificationChecklist
      },
      llm: {
        used: true,
        model: result.model || "",
        degraded: false,
        reason: ""
      }
    };
  } catch (error) {
    if (error instanceof LlmInvocationError) {
      throw error;
    }
    throw new LlmInvocationError(error instanceof Error ? error.message : "coach_llm_error");
  }
}
