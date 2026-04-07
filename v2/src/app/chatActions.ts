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
import { coachIterationMessage, createIterationMessage } from "./workspaceApi";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { normalizeUserChatInput } from "./workspaceChatMessagePresentation";
import { presentCoachReply } from "./workspaceChatReplyPresenter";
import { buildAutoFullCycleAnalysisInput } from "./uploadActions";
import { handleResumeFullCycle, handleRunFullCycle } from "./chatActionFullCycle";
import { handleRewrite } from "./chatActionRewrite";
import { handleConfirmAccurate, handleConfirmInaccurate } from "./chatActionConfirm";
import { handleReportRequest } from "./chatActionReportRequest";
import { handlePrototype } from "./chatActionPrototype";

/* ── pure helper ─────────────────────────────────────────────────────── */

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

    // ── coach 文字回复 ──
    const presentedReply = presentCoachReply(coach.reply);
    if (presentedReply) {
      const truncationWarning = coach.llm?.contentComplete === false
        ? "\n\n\u26A0\uFE0F 以上内容可能不完整，AI 输出被截断。如需完整内容，请发送\u201C请继续\u201D。"
        : "";
      await createMessage(currentIteration.id, "assistant", presentedReply + truncationWarning, deps.setChatMessages);
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
