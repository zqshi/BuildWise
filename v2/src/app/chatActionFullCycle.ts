import type { ChatActionDeps } from "./chatActions";
import { createMessage, resolveCoachErrorMessage } from "./chatActions";
import { runIterationFullCycle } from "./workspaceApi";
import type { AttachmentUploadInput } from "../domain/workspace/types";

const LABELS: Record<string, string> = {
  "analysis": "材料分析", "confirmation": "分析确认", "ux-guidance": "UX 执行指引",
  "frontend-rewrite": "前端改写", "backend-rewrite": "后端改写", "merge-rewrite": "改写合并",
  "test-artifacts": "测试产物", "release-review": "发布评审", "delivery-package": "交付包生成", "publish": "发布"
};

const STATUS_ICONS: Record<string, string> = { completed: "\u2713", failed: "\u2717", blocked: "\u2298", pending: "\u00B7" };

function buildCheckpointMessage(fullCycle: { status: string; warnings: string[]; blockers: string[]; checkpoint?: Record<string, unknown> | null }): string {
  const cp = fullCycle.checkpoint as { resumable?: boolean; steps: Record<string, { status: string; note?: string; missingPreconditions?: string[] }> } | undefined;
  if (!cp) {
    const statusLabel = fullCycle.status === "completed" ? "全部完成" : fullCycle.status === "partial" ? "部分完成" : fullCycle.status;
    const parts = [`全流程跑完了，${statusLabel}。`];
    if (fullCycle.blockers.length > 0) parts.push(`有 ${fullCycle.blockers.length} 个阻断项需要你关注。`);
    if (fullCycle.warnings.length > 0) parts.push(`${fullCycle.warnings.length} 个告警。`);
    return parts.join("");
  }

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

  if (completedSteps.length > 0) parts.push(`\n${STATUS_ICONS.completed} 已完成：${completedSteps.join("、")}`);
  if (blockedSteps.length > 0) parts.push(`\n${STATUS_ICONS.blocked} 阻断：${blockedSteps.join("；")}`);
  if (failedSteps.length > 0) parts.push(`\n${STATUS_ICONS.failed} 失败：${failedSteps.join("；")}`);
  if (fullCycle.warnings.length > 0) parts.push(`\n告警：${fullCycle.warnings.join("；")}`);

  if (cp.resumable && fullCycle.status !== "completed") {
    parts.push("\n\n满足上述前置条件后，可以再次触发全流程继续执行，已完成的步骤会自动跳过。");
  }

  return parts.join("");
}

export async function handleResumeFullCycle(
  deps: ChatActionDeps,
  _text: string,
  iterationId: number
): Promise<void> {
  deps.setChatSendStatus("processing-full-cycle");
  try {
    const fullCycle = await runIterationFullCycle(iterationId, {
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
    await createMessage(iterationId, "assistant", buildCheckpointMessage(fullCycle), deps.setChatMessages);
  } catch (err) {
    await createMessage(iterationId, "assistant", `全流程恢复失败：${resolveCoachErrorMessage(err)}`, deps.setChatMessages);
  }
  await deps.loadIterationDetail(iterationId);
}

export async function handleRunFullCycle(
  deps: ChatActionDeps,
  text: string,
  iterationId: number,
  autoAnalysisInput: AttachmentUploadInput | null
): Promise<void> {
  deps.setChatSendStatus("processing-full-cycle");
  try {
    const fullCycle = await runIterationFullCycle(iterationId, {
      analysisInput: autoAnalysisInput ?? undefined,
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
    await createMessage(iterationId, "assistant", buildCheckpointMessage(fullCycle), deps.setChatMessages);
  } catch (err) {
    await createMessage(iterationId, "assistant", `全流程执行失败：${resolveCoachErrorMessage(err)}`, deps.setChatMessages);
  }
}
