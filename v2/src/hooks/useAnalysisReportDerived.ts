import { useMemo } from "react";
import type { AttachmentAnalysisReport } from "../domain/workspace/types";
import type { Iteration, IterationMessage } from "../domain/workspace/types";
import { getMsgKind } from "../pages/projects/ChatMessageList";

export function useAnalysisReportDerived(
  analysisReport: AttachmentAnalysisReport | null,
  currentIteration: Iteration | null,
  chatMessages: IterationMessage[],
  isAnalyzingAttachment: boolean,
  testMatrixStatusMap: Record<string, string>,
  onlyHighValue: boolean
) {
  return useMemo(() => {
    const diffLocations = analysisReport?.diffLocations ?? [];
    const diffAdded = analysisReport?.versionDiff?.added ?? [];
    const diffChanged = analysisReport?.versionDiff?.changed ?? [];
    const diffRemoved = analysisReport?.versionDiff?.removed ?? [];
    const hasBaselineComparison = Boolean(
      analysisReport?.versionDiff?.baselineIterationName && analysisReport?.versionDiff?.baselineIterationName !== analysisReport?.iterationName
    );
    const showAdvancedReportSections = Boolean(analysisReport);
    const hasAnalysisEntryInChat = chatMessages.some((msg) => getMsgKind(msg) === "event-analysis");
    const lastUploadMessageId = [...chatMessages].reverse().find((msg) => getMsgKind(msg) === "event-upload")?.id;
    const canOpenAnalysisPanel = !isAnalyzingAttachment && (Boolean(analysisReport) || hasAnalysisEntryInChat);
    const materialRisks = (analysisReport?.risks || []).filter((item) => !item.includes("暂无显式风险"));
    const materialSuggestions = (analysisReport?.suggestions || []).filter(
      (item) => !item.includes("当前澄清问题已收敛") && !item.includes("暂无结构化差异")
    );
    const traceabilityMap = analysisReport?.traceabilityMap;
    const executableConstraints = analysisReport?.executableConstraints;
    const versionDiffDetailed = analysisReport?.versionDiffDetailed;
    const releaseReview = analysisReport?.releaseReview;
    const domainKnowledge = analysisReport?.domainKnowledge;
    const opsTriage = analysisReport?.opsTriage;
    const qualityArtifacts = analysisReport?.qualityArtifacts;
    const prioritizedFindings = analysisReport?.prioritizedFindings || [];
    const visiblePrioritizedFindings = onlyHighValue
      ? prioritizedFindings.filter((item) => item.priority === "P0" || item.priority === "P1")
      : prioritizedFindings;
    const clarificationQuestions = currentIteration?.changeControl?.clarificationQuestions ?? analysisReport?.clarificationQuestions ?? [];
    const generatedTestMatrix = currentIteration?.changeControl?.generatedTestMatrix ?? [];
    const matrixSummary = (() => {
      const total = generatedTestMatrix.length;
      const statuses = generatedTestMatrix.map((item) => testMatrixStatusMap[item.caseId] || item.executionStatus);
      const passed = statuses.filter((status) => status === "passed").length;
      const failed = statuses.filter((status) => status === "failed").length;
      const blocked = statuses.filter((status) => status === "blocked").length;
      const skipped = statuses.filter((status) => status === "skipped").length;
      const executed = passed + failed + blocked + skipped;
      const coverage = total === 0 ? 100 : Math.round((executed / total) * 100);
      const passRate = executed === 0 ? (total === 0 ? 100 : 0) : Math.round((passed / executed) * 100);
      return { total, executed, passed, failed, blocked, skipped, coverage, passRate };
    })();
    const reportPendingConfirmation = Boolean(currentIteration?.changeControl?.pendingHumanConfirmation);
    const reportConfirmedAt = currentIteration?.changeControl?.confirmedAt || "";
    const confirmedUnderstanding = (currentIteration?.changeControl?.lastClarificationNote || "").trim();

    return {
      diffLocations, diffAdded, diffChanged, diffRemoved,
      hasBaselineComparison, showAdvancedReportSections,
      lastUploadMessageId, canOpenAnalysisPanel,
      materialRisks, materialSuggestions,
      traceabilityMap, executableConstraints, versionDiffDetailed,
      releaseReview, domainKnowledge, opsTriage, qualityArtifacts,
      visiblePrioritizedFindings, clarificationQuestions,
      generatedTestMatrix, matrixSummary,
      reportPendingConfirmation, reportConfirmedAt, confirmedUnderstanding
    };
  }, [analysisReport, currentIteration, chatMessages, isAnalyzingAttachment, testMatrixStatusMap, onlyHighValue]);
}
