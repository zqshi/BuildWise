/**
 * Coach guidance builder — derives actionable guidance items from analysis report.
 */

import type { AttachmentAnalysisReport } from "../domain/workspace/analysisTypes";

export type CoachGuidanceItem = {
  label: string;
  text: string;
  type: "action" | "info" | "warning";
  icon: "alert" | "chat" | "check" | "info";
};

export function buildCoachGuidance(
  analysisReport: AttachmentAnalysisReport | null,
  reportPendingConfirmation: boolean
): CoachGuidanceItem[] {
  const items: CoachGuidanceItem[] = [];

  if (!analysisReport) {
    items.push({
      label: "上传材料",
      text: "上传需求文档或原型，开始分析",
      type: "action",
      icon: "info"
    });
    return items;
  }

  if (reportPendingConfirmation) {
    items.push({
      label: "确认分析",
      text: "分析报告已就绪，请确认理解是否准确",
      type: "action",
      icon: "alert"
    });
  }

  const p0 = analysisReport.prioritizedFindings?.filter((f) => f.priority === "P0") ?? [];
  if (p0.length > 0) {
    items.push({
      label: "关键问题",
      text: `有 ${p0.length} 个 P0 级问题需要优先处理`,
      type: "warning",
      icon: "alert"
    });
  }

  const questions = analysisReport.clarificationQuestions ?? [];
  if (questions.length > 0) {
    items.push({
      label: "待澄清",
      text: `有 ${questions.length} 个问题需要确认`,
      type: "action",
      icon: "chat"
    });
  }

  if (analysisReport.reportQuality?.publishable === false) {
    items.push({
      label: "质量不足",
      text: "报告尚未达到可发布标准，需要补充信息",
      type: "warning",
      icon: "alert"
    });
  }

  if (items.length === 0 && !reportPendingConfirmation) {
    items.push({
      label: "就绪",
      text: "分析已完成，可以继续推进",
      type: "info",
      icon: "check"
    });
  }

  return items;
}
