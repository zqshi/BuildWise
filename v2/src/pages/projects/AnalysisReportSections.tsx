/**
 * AnalysisReportSections — 分析报告段落组合入口（本体 + re-export 桥接）
 *
 * 职责：接收完整 props，分发给基础段落和高级段落两个子组件。
 *
 * 子模块（按段落域拆分，单向依赖，无循环）：
 * - AnalysisReportBasicSections: 基础段落（始终展示）
 * - AnalysisReportAdvancedSections: 高级段落（受 showAdvancedReportSections 控制）
 */

import type { AttachmentAnalysisReport, Iteration } from "./iterationWorkspacePanelTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";
import { AnalysisReportBasicSections } from "./AnalysisReportBasicSections";
import { AnalysisReportAdvancedSections } from "./AnalysisReportAdvancedSections";

// re-export 子组件供既有调用方继续从本文件 import（兼容层）
export { AnalysisReportBasicSections } from "./AnalysisReportBasicSections";
export { AnalysisReportAdvancedSections } from "./AnalysisReportAdvancedSections";

export type AnalysisReportSectionsProps = {
  analysisReport: AttachmentAnalysisReport;
  currentIteration: Iteration | null;
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;
  materialRisks: string[];
  materialSuggestions: string[];
  showAdvancedReportSections: boolean;
  hasBaselineComparison: boolean;
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"] | null;
  coachGuidance: CoachGuidanceItem[];
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  onChatInputChange: (value: string) => void;
  onChatSend: (options?: { overrideText?: string }) => Promise<unknown>;
};

export function AnalysisReportSections({
  analysisReport,
  currentIteration,
  reportPendingConfirmation,
  reportConfirmedAt,
  confirmedUnderstanding,
  onlyHighValue,
  visiblePrioritizedFindings,
  showAdvancedReportSections,
  traceabilityMap,
  executableConstraints,
  releaseReview,
  domainKnowledge,
  qualityArtifacts,
  versionDiffDetailed,
  businessConfirmation,
  coachGuidance,
  setOnlyHighValue,
  onChatInputChange,
  onChatSend,
}: AnalysisReportSectionsProps) {
  return (
    <>
      <AnalysisReportBasicSections
        analysisReport={analysisReport}
        currentIteration={currentIteration}
        reportPendingConfirmation={reportPendingConfirmation}
        reportConfirmedAt={reportConfirmedAt}
        confirmedUnderstanding={confirmedUnderstanding}
        onlyHighValue={onlyHighValue}
        visiblePrioritizedFindings={visiblePrioritizedFindings}
        businessConfirmation={businessConfirmation}
        coachGuidance={coachGuidance}
        setOnlyHighValue={setOnlyHighValue}
        onChatInputChange={onChatInputChange}
        onChatSend={onChatSend}
      />
      <AnalysisReportAdvancedSections
        analysisReport={analysisReport}
        showAdvancedReportSections={showAdvancedReportSections}
        traceabilityMap={traceabilityMap}
        executableConstraints={executableConstraints}
        versionDiffDetailed={versionDiffDetailed}
        releaseReview={releaseReview}
        domainKnowledge={domainKnowledge}
        qualityArtifacts={qualityArtifacts}
      />
    </>
  );
}
