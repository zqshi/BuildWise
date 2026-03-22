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
import {
  coachIterationMessage,
  confirmIterationAnalysis,
  createIterationMessage,
  executeIterationVisualEdit,
  rewriteIterationCode,
  runIterationFullCycle
} from "./workspaceApi";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { normalizeUserChatInput } from "./workspaceChatMessagePresentation";
import { presentCoachReply } from "./workspaceChatReplyPresenter";
import { buildAutoFullCycleAnalysisInput } from "./uploadActions";

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
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

/* ── shared helper ───────────────────────────────────────────────────── */

export const appendMessageLocal = (message: IterationMessage, setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>) => {
  setChatMessages((prev) => {
    if (prev.some((m) => m.id === message.id)) {
      return prev;
    }
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
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }
): Promise<IterationVisualEditResponse | null> => {
  const text = normalizeUserChatInput(options?.overrideText ?? deps.chatInput);
  if (!text || !deps.currentIteration) {
    return null;
  }
  const currentIteration = deps.currentIteration;
  deps.setChatSendStatus("sending");
  deps.setChatInput("");
  let userMessagePersisted = false;
  try {
    await createMessage(currentIteration.id, "user", text, deps.setChatMessages);
    userMessagePersisted = true;
    deps.setChatSendStatus("sent");
    if (options?.prototypeTarget) {
      const visualEditResult = await executeIterationVisualEdit(currentIteration.id, {
        message: text,
        target: {
          mode: options.interactionContext?.mode || "prototype",
          target: options.interactionContext?.target || options.prototypeTarget || "",
          summary: options.interactionContext?.summary || options.prototypeSummary || "",
          html: options.interactionContext?.html
        }
      });
      await createMessage(
        currentIteration.id,
        "assistant",
        `改好了。${visualEditResult.summary}`,
        deps.setChatMessages
      );
      if (visualEditResult.warnings.length > 0) {
        await createMessage(currentIteration.id, "assistant", `顺便提一下：${visualEditResult.warnings.join("；")}`, deps.setChatMessages);
      }
      return visualEditResult;
    }
    const resolvedQuestions = currentIteration.changeControl?.clarificationDraftResolvedQuestions ?? [];
    const coach = await coachIterationMessage(currentIteration.id, text);
    // Stale iteration check: if user switched iterations during the long LLM call, discard result
    if (deps.currentIteration?.id !== currentIteration.id) {
      return null;
    }
    const presentedReply = presentCoachReply(coach.reply);
    if (presentedReply) {
      const truncationWarning = coach.llm?.contentComplete === false
        ? "\n\n\u26A0\uFE0F 以上内容可能不完整，AI 输出被截断。如需完整内容，请发送\u201C请继续\u201D。"
        : "";
      await createMessage(currentIteration.id, "assistant", presentedReply + truncationWarning, deps.setChatMessages);
    }
    if (coach.execution?.action === "rewrite") {
      const instruction = (coach.execution.instruction || text).trim();
      if (!instruction) {
        await createMessage(currentIteration.id, "assistant", "请补充具体改写目标（例如：更新 KPI 卡片标题与数据源）。", deps.setChatMessages);
        return null;
      }
      const rewrite = await rewriteIterationCode(currentIteration.id, {
        instruction,
        dryRun: coach.execution.apply === false,
        maxFiles: 6
      });
      const changed = rewrite.edits.map((item) => item.path).join("；") || "无变更";
      const header = rewrite.dryRun
        ? `我先预览了一下改动范围，还没有真正执行。`
        : `改动已经执行完了。`;
      await createMessage(currentIteration.id, "assistant", `${header}${rewrite.summary}\n涉及的文件：${changed}`, deps.setChatMessages);
      if (rewrite.outOfBoundaryFiles.length > 0) {
        await createMessage(currentIteration.id, "system", `有几个文件超出了本轮迭代的变更边界，没有动：${rewrite.outOfBoundaryFiles.join("；")}`, deps.setChatMessages);
      }
      await deps.loadIterationDetail(currentIteration.id);
      return null;
    }
    if (coach.execution?.action === "confirm-inaccurate") {
      await confirmIterationAnalysis(currentIteration.id, {
        accurate: false,
        note: text,
        actor: deps.currentRole,
        resolvedClarificationQuestions: resolvedQuestions
      });
      await createMessage(
        currentIteration.id,
        "assistant",
        "收到，看来之前的理解有偏差。你能补充一下你预期的范围和验收结果吗？我重新对齐一下。",
        deps.setChatMessages
      );
      await deps.loadIterationDetail(currentIteration.id);
      if (deps.currentProjectId) {
        await deps.loadIterations(deps.currentProjectId);
      }
      await deps.loadGovernance();
      return null;
    }
    if (coach.execution?.action === "confirm-accurate") {
      if (deps.analysisReport?.reportQuality && !deps.analysisReport.reportQuality.publishable) {
        await createMessage(
          currentIteration.id,
          "assistant",
          `当前分析报告未达到发布门禁（${deps.analysisReport.reportQuality.score}分）：${deps.analysisReport.reportQuality.summary || "请先补齐缺失项后再确认。"}`,
          deps.setChatMessages
        );
        return null;
      }
      await confirmIterationAnalysis(currentIteration.id, {
        accurate: true,
        note: text,
        actor: deps.currentRole,
        resolvedClarificationQuestions: resolvedQuestions
      });
      await createMessage(currentIteration.id, "assistant", "分析确认完成了。接下来可以继续推进任务拆解、测试或者发布，你想先做哪块？", deps.setChatMessages);
      await deps.loadIterationDetail(currentIteration.id);
      if (deps.currentProjectId) {
        await deps.loadIterations(deps.currentProjectId);
      }
      await deps.loadGovernance();
      return null;
    }
    if (coach.execution?.action === "enter-clarify-mode") {
      await createMessage(currentIteration.id, "assistant", "好，进入澄清模式了。接下来我会集中确认几个关键问题，一个一个来。", deps.setChatMessages);
    }
    if (coach.execution?.action === "run-full-cycle" || coach.intent === "full-cycle") {
      const autoAnalysisInput = buildAutoFullCycleAnalysisInput(currentIteration, deps.analysisReport, deps.uploadedFile);
      const fullCycle = await runIterationFullCycle(currentIteration.id, {
        analysisInput: autoAnalysisInput,
        runAnalysis: Boolean(autoAnalysisInput),
        autoConfirmAnalysis: true,
        autoResolveClarifications: true,
        rewriteInstruction: text.trim() || undefined,
        rewriteDryRun: false,
        generateTestArtifacts: true,
        testArtifactsDryRun: false,
        refreshReleaseReview: true,
        generateDeliveryPackage: true,
        deliveryPackageDryRun: false,
        publish: { enabled: true, dryRun: false }
      });
      const reviewReportFiles = fullCycle.deliveryPackageResult?.reviewReportFiles || [];
      const deliveryPackageFiles = fullCycle.deliveryPackageResult?.packageFiles || [];
      const frontendLane = fullCycle.steps?.frontendRewrite;
      const backendLane = fullCycle.steps?.backendRewrite;
      const statusLabel = fullCycle.status === "completed" ? "全部完成" : fullCycle.status === "partial" ? "部分完成" : fullCycle.status;
      const parts = [`全流程跑完了，${statusLabel}。`];
      if (fullCycle.blockers.length > 0) {
        parts.push(`有 ${fullCycle.blockers.length} 个阻断项需要你关注。`);
      }
      if (fullCycle.warnings.length > 0) {
        parts.push(`${fullCycle.warnings.length} 个告警。`);
      }
      if (frontendLane?.status) {
        parts.push(`前端：${frontendLane.status}${frontendLane.note ? `（${frontendLane.note}）` : ""}`);
      }
      if (backendLane?.status) {
        parts.push(`后端：${backendLane.status}${backendLane.note ? `（${backendLane.note}）` : ""}`);
      }
      if (reviewReportFiles.length > 0) {
        parts.push(`发布评审报告已生成。`);
      }
      if (deliveryPackageFiles.length > 0) {
        parts.push(`交付包已打好，可以部署了。`);
      }
      await createMessage(currentIteration.id, "assistant", parts.join(""), deps.setChatMessages);
    }
    await deps.loadIterationDetail(currentIteration.id);
    return null;
  } catch (err) {
    const message = resolveCoachErrorMessage(err);
    deps.setError(userMessagePersisted ? `消息已发送，但后续处理失败：${message}` : message);
    if (!userMessagePersisted) {
      deps.setChatSendStatus("failed");
    }
    return null;
  }
};
