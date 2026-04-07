import type { Dispatch, SetStateAction } from "react";
import type { ChatActionDeps } from "./chatActions";
import { createMessage } from "./chatActions";
import {
  fetchLatestAnalysisReport,
  retryLatestAttachmentAnalysisJob,
  waitForAttachmentAnalysisJob
} from "./workspaceApi";
import type { AttachmentAnalysisReport, IterationMessage } from "../domain/workspace/types";

export async function handleReportRequest(
  deps: ChatActionDeps,
  iterationId: number,
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>
): Promise<void> {
  let report: AttachmentAnalysisReport | null = deps.analysisReport;
  if (!report) {
    report = await fetchLatestAnalysisReport(iterationId);
  }

  const hasRealFindings = (report?.meaningfulFindings?.length ?? 0) > 0
    || (report?.prioritizedFindings?.length ?? 0) > 0;

  if (!hasRealFindings) {
    try {
      deps.setChatSendStatus("processing-full-cycle");
      const retryJob = await retryLatestAttachmentAnalysisJob(iterationId);
      if (retryJob?.jobId) {
        report = await waitForAttachmentAnalysisJob(iterationId, retryJob.jobId);
      }
    } catch (err) {
      console.warn("[chatActionReportRequest] retry analysis failed", err);
    }
  }

  if (report && ((report.meaningfulFindings?.length ?? 0) > 0 || (report.prioritizedFindings?.length ?? 0) > 0)) {
    deps.setShowAnalysisPanel(true);
    const findings = report.meaningfulFindings ?? [];
    const pFindings = report.prioritizedFindings ?? [];
    const highP = pFindings.filter((f) => f.priority === "P0" || f.priority === "P1");
    await createMessage(iterationId, "assistant", [
      "【交付物引用】分析报告",
      `摘要：${findings.slice(0, 3).join("；") || "已完成材料分析"}`,
      `关注点：${highP.length > 0 ? highP.map((f) => f.content || f.reason).filter(Boolean).join("；") : "无高优发现"}`,
      "请查看右侧分析报告面板，逐条确认分析结论是否准确。"
    ].join("\n"), setChatMessages);
  }

  await deps.loadIterationDetail(iterationId);
}
