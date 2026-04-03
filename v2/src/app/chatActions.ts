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
  if (_sendInFlight) return null;
  _sendInFlight = true;
  const currentIteration = deps.currentIteration;
  deps.setChatSendStatus("sending");
  deps.setChatInput("");
  let userMessagePersisted = false;
  try {
    // ── 全流程断点恢复：检测"继续全流程" intent ──
    const cc = currentIteration.changeControl as Record<string, unknown> | undefined;
    const checkpoint = cc?.fullCycleCheckpoint as Record<string, unknown> | undefined;
    if (/继续全流程|继续执行|resume.*full.?cycle/.test(text) && checkpoint?.resumable) {
      await createMessage(currentIteration.id, "user", text, deps.setChatMessages);
      userMessagePersisted = true;
      deps.setChatSendStatus("processing-full-cycle");
      const fullCycle = await runIterationFullCycle(currentIteration.id, {
        runAnalysis: false,
        autoConfirmAnalysis: true,
        autoResolveClarifications: true,
        generateTestArtifacts: true,
        testArtifactsDryRun: false,
        refreshReleaseReview: true,
        generateDeliveryPackage: true,
        deliveryPackageDryRun: false,
        publish: { enabled: true, dryRun: false }
      });
      const cp = fullCycle.checkpoint;
      if (cp) {
        const LABELS: Record<string, string> = {
          "analysis": "材料分析", "confirmation": "分析确认", "ux-guidance": "UX 执行指引",
          "frontend-rewrite": "前端改写", "backend-rewrite": "后端改写", "merge-rewrite": "改写合并",
          "test-artifacts": "测试产物", "release-review": "发布评审", "delivery-package": "交付包生成", "publish": "发布"
        };
        const STATUS_ICONS: Record<string, string> = { completed: "\u2713", failed: "\u2717", blocked: "\u2298", pending: "\u00B7" };
        const completedSteps: string[] = [];
        const blockedSteps: string[] = [];
        const failedSteps: string[] = [];
        for (const [stepId, state] of Object.entries(cp.steps)) {
          const label = LABELS[stepId] || stepId;
          if (state.status === "completed") completedSteps.push(label);
          else if (state.status === "blocked") blockedSteps.push(`${label}\uFF08${state.missingPreconditions?.join("\u3001") || state.note}\uFF09`);
          else if (state.status === "failed") failedSteps.push(`${label}\uFF08${state.note}\uFF09`);
        }
        const statusLabel = fullCycle.status === "completed" ? "全部完成"
          : fullCycle.status === "partial" ? "部分完成，已在断点暂停"
          : fullCycle.status === "blocked" ? "在前置条件处停住了"
          : "执行失败";
        const parts = [`全流程执行结果：${statusLabel}。`];
        if (completedSteps.length > 0) parts.push(`\n${STATUS_ICONS.completed} 已完成：${completedSteps.join("\u3001")}`);
        if (blockedSteps.length > 0) parts.push(`\n${STATUS_ICONS.blocked} 阻断：${blockedSteps.join("\uFF1B")}`);
        if (failedSteps.length > 0) parts.push(`\n${STATUS_ICONS.failed} 失败：${failedSteps.join("\uFF1B")}`);
        if (fullCycle.warnings.length > 0) parts.push(`\n告警：${fullCycle.warnings.join("\uFF1B")}`);
        if (cp.resumable && fullCycle.status !== "completed") {
          parts.push("\n\n满足上述前置条件后，可以再次发送「继续全流程」从断点恢复。");
        }
        await createMessage(currentIteration.id, "assistant", parts.join(""), deps.setChatMessages);
      }
      await deps.loadIterationDetail(currentIteration.id);
      return null;
    }
    await createMessage(currentIteration.id, "user", text, deps.setChatMessages);
    userMessagePersisted = true;
    deps.setChatSendStatus("processing");
    if (options?.prototypeTarget) {
      deps.setChatSendStatus("processing-executing");
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
      deps.setChatSendStatus("idle");
      return visualEditResult;
    }
    const coach = await coachIterationMessage(currentIteration.id, text);
    // LLM coach 回复已收到，切换到执行阶段
    deps.setChatSendStatus("processing-executing");
    // Stale iteration check: if user switched iterations during the long LLM call, discard result
    if (deps.currentIteration?.id !== currentIteration.id) {
      return null;
    }

    // ── Step 1: 展示 coach 文字回复 ──
    const presentedReply = presentCoachReply(coach.reply);
    if (presentedReply) {
      const truncationWarning = coach.llm?.contentComplete === false
        ? "\n\n\u26A0\uFE0F 以上内容可能不完整，AI 输出被截断。如需完整内容，请发送\u201C请继续\u201D。"
        : "";
      await createMessage(currentIteration.id, "assistant", presentedReply + truncationWarning, deps.setChatMessages);
    }

    // ── Step 2: 执行 execution action（全部执行完再决定是否发卡片） ──
    const executionAction = coach.execution?.action;

    if (executionAction === "rewrite") {
      const instruction = (coach.execution!.instruction || text).trim();
      if (!instruction) {
        await createMessage(currentIteration.id, "assistant", "请补充具体改写目标（例如：更新 KPI 卡片标题与数据源）。", deps.setChatMessages);
        return null;
      }
      const rewrite = await rewriteIterationCode(currentIteration.id, {
        instruction,
        dryRun: coach.execution!.apply === false,
        maxFiles: 6
      });
      const changed = rewrite.edits.map((item) => item.path).join("；") || "无变更";
      const header = rewrite.dryRun
        ? "我先预览了一下改动范围，还没有真正执行。"
        : "改动已经执行完了。";
      await createMessage(currentIteration.id, "assistant", `${header}${rewrite.summary}\n涉及的文件：${changed}`, deps.setChatMessages);
      if (rewrite.outOfBoundaryFiles.length > 0) {
        await createMessage(currentIteration.id, "system", `有几个文件超出了本轮迭代的变更边界，没有动：${rewrite.outOfBoundaryFiles.join("；")}`, deps.setChatMessages);
      }
      await deps.loadIterationDetail(currentIteration.id);
      return null;
    }

    if (executionAction === "confirm-inaccurate") {
      await confirmIterationAnalysis(currentIteration.id, {
        accurate: false,
        note: text,
        actor: deps.currentRole,
        resolvedClarificationQuestions: currentIteration.changeControl?.clarificationDraftResolvedQuestions ?? []
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

    if (executionAction === "confirm-accurate") {
      if (deps.analysisReport?.reportQuality && !deps.analysisReport.reportQuality.publishable) {
        await createMessage(
          currentIteration.id,
          "assistant",
          `当前分析报告未达到发布门禁（${deps.analysisReport.reportQuality.score}分）：${deps.analysisReport.reportQuality.summary || "请先补齐缺失项后再确认。"}`,
          deps.setChatMessages
        );
        return null;
      }
      const allQuestions = currentIteration.changeControl?.clarificationQuestions ?? [];
      try {
        await confirmIterationAnalysis(currentIteration.id, {
          accurate: true,
          note: text,
          actor: deps.currentRole,
          resolvedClarificationQuestions: allQuestions
        });
      } catch (confirmErr) {
        const errMsg = resolveCoachErrorMessage(confirmErr);
        if (errMsg.includes("409") || errMsg.includes("clarification") || errMsg.includes("unresolved")) {
          await createMessage(
            currentIteration.id,
            "assistant",
            "还有几个待澄清的问题需要先确认。我帮你逐个过一下，你看着回复就行。",
            deps.setChatMessages
          );
          return null;
        }
        throw confirmErr;
      }
      await createMessage(currentIteration.id, "assistant", "分析确认完成了。接下来可以继续推进任务拆解、测试或者发布，你想先做哪块？", deps.setChatMessages);
      await deps.loadIterationDetail(currentIteration.id);
      if (deps.currentProjectId) {
        await deps.loadIterations(deps.currentProjectId);
      }
      await deps.loadGovernance();
      return null;
    }

    if (executionAction === "enter-clarify-mode") {
      await createMessage(currentIteration.id, "assistant", "好，进入澄清模式了。接下来我会集中确认几个关键问题，一个一个来。", deps.setChatMessages);
    }

    if (executionAction === "run-full-cycle" || coach.intent === "full-cycle") {
      // full-cycle 会生成所有交付物内容
      deps.setChatSendStatus("processing-full-cycle");
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

      // ── 基于 checkpoint 生成精确进度报告 ──
      const cp = fullCycle.checkpoint;
      if (cp) {
        const LABELS: Record<string, string> = {
          "analysis": "材料分析", "confirmation": "分析确认", "ux-guidance": "UX 执行指引",
          "frontend-rewrite": "前端改写", "backend-rewrite": "后端改写", "merge-rewrite": "改写合并",
          "test-artifacts": "测试产物", "release-review": "发布评审", "delivery-package": "交付包生成", "publish": "发布"
        };
        const STATUS_ICONS: Record<string, string> = { completed: "✓", failed: "✗", blocked: "⊘", pending: "·" };
        const completedSteps: string[] = [];
        const blockedSteps: string[] = [];
        const failedSteps: string[] = [];

        for (const [stepId, state] of Object.entries(cp.steps)) {
          const label = LABELS[stepId] || stepId;
          if (state.status === "completed") completedSteps.push(label);
          else if (state.status === "blocked") blockedSteps.push(`${label}（${state.missingPreconditions?.join("、") || state.note}）`);
          else if (state.status === "failed") failedSteps.push(`${label}（${state.note}）`);
        }

        const statusLabel = fullCycle.status === "completed" ? "全部完成"
          : fullCycle.status === "partial" ? "部分完成，已在断点暂停"
          : fullCycle.status === "blocked" ? "在前置条件处停住了"
          : "执行失败";
        const parts = [`全流程执行结果：${statusLabel}。`];

        if (completedSteps.length > 0) {
          parts.push(`\n${STATUS_ICONS.completed} 已完成：${completedSteps.join("、")}`);
        }
        if (blockedSteps.length > 0) {
          parts.push(`\n${STATUS_ICONS.blocked} 阻断：${blockedSteps.join("；")}`);
        }
        if (failedSteps.length > 0) {
          parts.push(`\n${STATUS_ICONS.failed} 失败：${failedSteps.join("；")}`);
        }
        if (fullCycle.warnings.length > 0) {
          parts.push(`\n告警：${fullCycle.warnings.join("；")}`);
        }

        // 可续跑提示
        if (cp.resumable && fullCycle.status !== "completed") {
          parts.push("\n\n满足上述前置条件后，可以再次触发全流程继续执行，已完成的步骤会自动跳过。");
        }

        await createMessage(currentIteration.id, "assistant", parts.join(""), deps.setChatMessages);
      } else {
        // 降级：无 checkpoint 时用旧逻辑
        const statusLabel = fullCycle.status === "completed" ? "全部完成" : fullCycle.status === "partial" ? "部分完成" : fullCycle.status;
        const parts = [`全流程跑完了，${statusLabel}。`];
        if (fullCycle.blockers.length > 0) parts.push(`有 ${fullCycle.blockers.length} 个阻断项需要你关注。`);
        if (fullCycle.warnings.length > 0) parts.push(`${fullCycle.warnings.length} 个告警。`);
        await createMessage(currentIteration.id, "assistant", parts.join(""), deps.setChatMessages);
      }
    }

    // ── Step 3: 交付物卡片由后端在内容生成完毕后发布，前端轮询刷新以呈现
    // full-cycle 跳过（已自动生成全部内容）
    // rewrite/confirm-* 已 return，不会走到这里
    await deps.loadIterationDetail(currentIteration.id);

    // 交付物生成状态由后端 artifactGenerationStartedAt 驱动，前端通过 useAppController 监控
    // 此处不再手动设置 processing-artifacts 或发送系统消息

    return null;
  } catch (err) {
    const message = resolveCoachErrorMessage(err);
    deps.setError(userMessagePersisted ? `消息已发送，但后续处理失败：${message}` : message);
    if (!userMessagePersisted) {
      deps.setChatSendStatus("failed");
    }
    return null;
  } finally {
    _sendInFlight = false;
    // Ensure processing indicator is cleared on all exit paths
    // (except explicit "failed" which is managed by polling)
    deps.setChatSendStatus((prev) => (prev === "failed" ? prev : "idle"));
  }
};
