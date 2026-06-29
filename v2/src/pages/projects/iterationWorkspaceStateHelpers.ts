/**
 * iterationWorkspaceStateHelpers — useIterationWorkspaceState 的纯函数辅助
 *
 * 从 useIterationWorkspaceState 拆出的非 hook 纯逻辑：
 * - chat 处理状态推导
 * - 确认分析 handler 构建
 * - LLM 进度基数计算
 * - 原型项映射 / 图像选择摘要 / 原型树构建
 *
 * 纯函数，无 React 依赖，可独立单测。
 */
import type { IterationWorkspacePanelProps, PrototypeElement } from "./iterationWorkspacePanelTypes";

/** 推导 chat 处理状态（是否处理中 / 制品生成声明/完成/进行中/全完成）。 */
export function deriveChatProcessingState(props: IterationWorkspacePanelProps) {
  const { chatSendStatus } = props;
  const isChatProcessing = chatSendStatus === "processing" || chatSendStatus === "processing-executing"
    || chatSendStatus === "processing-artifacts" || chatSendStatus === "processing-full-cycle";
  const ccRaw = props.currentIteration?.changeControl as Record<string, unknown> | undefined;
  const artifactGenDeclared = (ccRaw?.artifactGenerationArtifacts as string[] | undefined) ?? [];
  const artifactGenCompleted = (ccRaw?.artifactGenerationCompletedArtifacts as string[] | undefined) ?? [];
  const artifactGenInProgress = chatSendStatus === "processing-artifacts" && artifactGenDeclared.length > 0;
  const artifactGenAllDone = artifactGenInProgress && artifactGenCompleted.length >= artifactGenDeclared.length;
  return { isChatProcessing, artifactGenDeclared, artifactGenCompleted, artifactGenInProgress, artifactGenAllDone };
}

/** 构建确认分析 handler：先确认 analysis-report 制品，再触发迭代分析确认，完成后提示。 */
export function buildConfirmAnalysisHandler(
  onConfirmArtifact: IterationWorkspacePanelProps["onConfirmArtifact"],
  onConfirmIterationAnalysis: IterationWorkspacePanelProps["onConfirmIterationAnalysis"],
  clarificationQuestions: unknown,
  setChangeControlNotice: (v: string) => void,
): () => void {
  return () => {
    const confirmResult = onConfirmArtifact("analysis-report", { actor: "项目负责人", passed: true });
    const artifactPromise = confirmResult && typeof (confirmResult as Promise<void>).then === "function"
      ? (confirmResult as Promise<void>).catch((err: unknown) => {
          console.warn("[IterationWorkspacePanel] analysis-report confirm failed (non-blocking)", err);
        })
      : Promise.resolve();
    const result = onConfirmIterationAnalysis({
      accurate: true, decisionEvent: "understanding-accurate", force: true,
      resolvedClarificationQuestions: Array.isArray(clarificationQuestions) ? clarificationQuestions : [],
    });
    if (result && typeof result.then === "function") {
      void Promise.all([result, artifactPromise]).then(() => setChangeControlNotice("分析已确认。"));
    }
  };
}

/** 根据 chat 状态 + 制品生成进度计算 LLM 进度基数。 */
export function computeLlmBase(status: string, declared: string[], completed: string[]): number {
  if (status === "processing-executing") return 50;
  if (status === "processing-artifacts") {
    return declared.length > 0 && completed.length > 0
      ? Math.max(75, Math.round((completed.length / declared.length) * 95))
      : 75;
  }
  if (status === "processing-full-cycle") return 30;
  return 15;
}

/** 把原型文件路径列表映射为原型元素（取前 12 项，按路径推断 page/component/尺寸）。 */
export function mapPrototypeItems(items: string[]): PrototypeElement[] {
  return items.slice(0, 12).map((item, index) => {
    const normalized = item.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || `原型元素-${index + 1}`;
    const page = parts.length >= 3 ? parts[0] : "原型主页面";
    const component = parts.length >= 2 ? parts[parts.length - 2] : "主区域";
    return {
      id: `proto-${index}`, page, component, label: fileName,
      background: index % 2 === 0 ? "#ffffff" : "#f8fafc", color: "#0f172a",
      visible: true, emphasized: index === 0,
      width: /mobile|phone|h5/i.test(normalized) ? 320 : 460,
      height: /card|panel|list/i.test(normalized) ? 88 : 48,
    } as PrototypeElement;
  });
}

/** 构建图像选择摘要文本（区域或点位）。 */
export function buildImageSelectionSummary(
  region: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } | null,
  point: { xPercent: number; yPercent: number } | null,
): string {
  if (region) return `区域 x=${region.xPercent.toFixed(1)}% y=${region.yPercent.toFixed(1)}% w=${region.widthPercent.toFixed(1)}% h=${region.heightPercent.toFixed(1)}%`;
  if (point) return `点位 x=${point.xPercent.toFixed(1)}% y=${point.yPercent.toFixed(1)}%`;
  return "";
}

/** 把原型元素列表构建为 page→component→elements 的树形结构。 */
export function buildPrototypeTree(elements: PrototypeElement[]): Record<string, Record<string, PrototypeElement[]>> {
  return elements.reduce<Record<string, Record<string, PrototypeElement[]>>>((acc, item) => {
    if (!acc[item.page]) acc[item.page] = {};
    if (!acc[item.page][item.component]) acc[item.page][item.component] = [];
    acc[item.page][item.component].push(item);
    return acc;
  }, {});
}
