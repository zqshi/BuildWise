import type { Dispatch, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
  ChatRole,
  ChatSendStatus,
  Iteration,
  IterationMessage,
  IterationVisualEditResponse
} from "../domain/workspace/types";
import type { UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import { coachIterationMessage, createIterationMessage, detectIterationChangeImpact } from "./workspaceApi";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { normalizeUserChatInput } from "./workspaceChatMessagePresentation";
import { presentCoachReply } from "./workspaceChatReplyPresenter";
import { buildAutoFullCycleAnalysisInput } from "./uploadActions";
import { handleResumeFullCycle, handleRunFullCycle } from "./chatActionFullCycle";
import { handleRewrite } from "./chatActionRewrite";
import { handleConfirmAccurate, handleConfirmInaccurate } from "./chatActionConfirm";
import { handleReportRequest } from "./chatActionReportRequest";
import { handlePrototype } from "./chatActionPrototype";
import { buildCoachFollowupMessage } from "./coachConversationGuide";

/* ── pure helper ─────────────────────────────────────────────────────── */

const buildIdleHint = (
  iteration: Iteration,
  analysisReport: AttachmentAnalysisReport | null
): string | null => {
  const cc = iteration.changeControl as Record<string, unknown> | undefined;
  const questions = (cc?.clarificationQuestions ?? []) as string[];
  const confirmed = Boolean(cc?.analysisConfirmed);
  const pendingConfirmation = Boolean(cc?.pendingHumanConfirmation);

  if (!analysisReport) {
    return "你可以上传需求文档或原型，我来帮你做分析。也可以直接描述你的需求，我来引导你一步步推进。";
  }
  if (questions.length > 0 && !confirmed) {
    return `还有 ${questions.length} 个澄清问题待确认，请逐个回复或输入「全部确认」。`;
  }
  if (pendingConfirmation && !confirmed) {
    return "分析报告已就绪，请确认分析结论是否准确。输入「确认」或「不准确」来继续。";
  }
  if (confirmed) {
    return "分析已确认，你可以输入「开始拆解任务」来生成本迭代执行清单，或者告诉我你想先推进哪块。";
  }
  return null;
};

export const resolveCoachErrorMessage = (error: unknown) => {
  const raw = resolveErrorMessage(error);
  if (raw.includes("API error: 503")) {
    return "对话引导当前未接入 AI 服务。请联系管理员完成配置后再发送消息。";
  }
  if (raw.includes("API error: 502")) {
    return "对话引导调用大模型失败，请检查模型服务可达性后重试。";
  }
  if (raw.includes("network unavailable") || raw.includes("request timeout")) {
    return "对话发送失败：后端服务不可达，请检查服务状态。";
  }
  return raw;
};

/* ── deps type ───────────────────────────────────────────────────────── */

export type ChatActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  chatInput: string;
  analysisReport: AttachmentAnalysisReport | null;
  uploadedFile: UploadedAttachmentMeta | null;
  setChatInput: Dispatch<SetStateAction<string>>;
  setChatSendStatus: Dispatch<SetStateAction<ChatSendStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

/* ── shared helpers ──────────────────────────────────────────────────── */

export const appendMessageLocal = (message: IterationMessage, setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>) => {
  setChatMessages((prev) => {
    if (prev.some((m) => m.id === message.id)) return prev;
    return [...prev, message];
  });
};

export const createMessage = async (
  iterationId: number,
  role: ChatRole,
  content: string,
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>
) => {
  const created = await createIterationMessage(iterationId, role, content);
  appendMessageLocal(created, setChatMessages);
};

/* ── handleSend ──────────────────────────────────────────────────────── */

let _sendInFlight = false;

export const handleSend = async (
  deps: ChatActionDeps,
  options?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: { selector?: string; tag?: string; text?: string; styles?: Record<string, string> };
    };
  }
): Promise<IterationVisualEditResponse | null> => {
  const text = normalizeUserChatInput(options?.overrideText ?? deps.chatInput);
  if (!text || !deps.currentIteration) return null;
  if (_sendInFlight) return null;
  _sendInFlight = true;

  const currentIteration = deps.currentIteration;
  deps.setChatSendStatus("sending");
  deps.setChatInput("");
  let userMessagePersisted = false;

  try {
    // ── 全流程断点恢复 ──
    const cc = currentIteration.changeControl as Record<string, unknown> | undefined;
    const checkpoint = cc?.fullCycleCheckpoint as Record<string, unknown> | undefined;
    if (/继续全流程|继续执行|resume.*full.?cycle/.test(text) && checkpoint?.resumable) {
      await createMessage(currentIteration.id, "user", text, deps.setChatMessages);
      userMessagePersisted = true;
      await handleResumeFullCycle(deps, text, currentIteration.id);
      return null;
    }

    await createMessage(currentIteration.id, "user", text, deps.setChatMessages);
    userMessagePersisted = true;
    deps.setChatSendStatus("processing");

    // ── 影响范围前置检测（以本体为基础，前置提示非阻断；命中则追加【变更影响】系统消息）──
    try {
      const impact = await detectIterationChangeImpact(currentIteration.id, text);
      if (impact.hasImpact) {
        const items = [...impact.affectedTerms, ...impact.affectedEntities, ...impact.affectedRules];
        if (items.length > 0) {
          await createMessage(
            currentIteration.id, "system",
            `【变更影响】${items.join("·")}｜${impact.summary}`,
            deps.setChatMessages
          );
        }
      }
    } catch (err) {
      console.warn("[chatActions] 影响范围检测失败，跳过提示", err);
    }

    // ── prototype 交互 ──
    if (options?.prototypeTarget) {
      return await handlePrototype(deps, currentIteration.id, text, {
        prototypeTarget: options.prototypeTarget,
        interactionContext: options.interactionContext,
        prototypeSummary: options.prototypeSummary
      });
    }

    // ── coach 对话 ──
    let coach;
    try {
      coach = await coachIterationMessage(currentIteration.id, text);
    } catch (firstErr) {
      console.warn("[chatActions] coach 首次调用失败，2s 后重试", firstErr);
      await new Promise<void>((r) => setTimeout(r, 2000));
      coach = await coachIterationMessage(currentIteration.id, text);
    }

    deps.setChatSendStatus("processing-executing");
    if (deps.currentIteration?.id !== currentIteration.id) return null;

    // ── coach 文字回复 + guidance 合并 ──
    const presentedReply = presentCoachReply(coach.reply);
    const truncationWarning = coach.llm?.contentComplete === false
      ? "\u26A0\uFE0F 以上内容可能不完整，AI 输出被截断。如需完整内容，请发送\u201C请继续\u201D。"
      : "";
    const guidanceFollowup = buildCoachFollowupMessage({
      intent: coach.intent ?? "general",
      guidance: coach.guidance ?? { uploadRecommended: false, suggestedUploadTypes: [], suggestedActions: [], clarificationChecklist: [] }
    });
    const mergedReply = [presentedReply, truncationWarning, guidanceFollowup].filter(Boolean).join("\n\n");
    if (mergedReply) {
      await createMessage(currentIteration.id, "assistant", mergedReply, deps.setChatMessages);
    }

    // ── execution action 分发 ──
    const executionAction = coach.execution?.action;

    if (executionAction === "rewrite") {
      const instruction = (coach.execution?.instruction || text).trim();
      await handleRewrite(deps, currentIteration.id, instruction, coach.execution?.apply === false);
      return null;
    }

    if (executionAction === "confirm-inaccurate") {
      await handleConfirmInaccurate(deps, currentIteration.id, text, currentIteration);
      return null;
    }

    if (executionAction === "confirm-accurate") {
      await handleConfirmAccurate(deps, currentIteration.id, text, currentIteration);
      return null;
    }

    if (executionAction === "enter-clarify-mode") {
      await createMessage(currentIteration.id, "assistant", "好，进入澄清模式了。接下来我会集中确认几个关键问题，一个一个来。", deps.setChatMessages);
      await deps.loadIterationDetail(currentIteration.id);
    }

    if (executionAction === "capture-business-rule") {
      await createMessage(
        currentIteration.id, "assistant",
        "好的，这条业务规则已记录。我会在后续分析中体现它，并同步到项目知识库。",
        deps.setChatMessages
      );
      await deps.loadIterationDetail(currentIteration.id);
    }

    if (executionAction === "run-full-cycle" || coach.intent === "full-cycle") {
      const autoAnalysisInput = buildAutoFullCycleAnalysisInput(currentIteration, deps.analysisReport, deps.uploadedFile);
      await handleRunFullCycle(deps, text, currentIteration.id, autoAnalysisInput ?? null);
    }

    // ── 分析报告请求 ──
    const isReportRequest = /分析结论|分析报告|分析结果|查看报告|看报告|看分析|发给我|给我看/.test(text);
    if (isReportRequest && (!executionAction || executionAction === "none")) {
      await handleReportRequest(deps, currentIteration.id, deps.setChatMessages);
    } else {
      await deps.loadIterationDetail(currentIteration.id);
    }

    // ── 兜底引导：当 coach 没有触发任何动作时提示用户下一步 ──
    if ((!executionAction || executionAction === "none") && !guidanceFollowup && !isReportRequest) {
      const hint = buildIdleHint(currentIteration, deps.analysisReport);
      if (hint) {
        await createMessage(currentIteration.id, "assistant", hint, deps.setChatMessages);
      }
    }

    return null;
  } catch (err) {
    const message = resolveCoachErrorMessage(err);
    deps.setError(userMessagePersisted ? `消息已发送，但后续处理失败：${message}` : message);
    if (!userMessagePersisted) deps.setChatSendStatus("failed");
    return null;
  } finally {
    _sendInFlight = false;
    deps.setChatSendStatus((prev) => (prev === "failed" ? prev : "idle"));
  }
};
