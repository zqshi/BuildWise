/**
 * 分析报告高级段落 —— 分析范围、逐文件洞察、跨文件综合、测试产物、需求映射、可执行约束、发布评审、领域知识、版本差异、报告可靠度。
 * 受 showAdvancedReportSections 控制，默认折叠以聚焦核心结论。
 */

import type { AttachmentAnalysisReport } from "./iterationWorkspacePanelTypes";
import { describeReleaseReviewPerPlatform } from "./releaseReviewPerPlatformPresenter";
import { TARGET_PLATFORM_LABELS } from "./TargetPlatformsPicker";

export type AnalysisReportAdvancedSectionsProps = {
  analysisReport: AttachmentAnalysisReport;
  showAdvancedReportSections: boolean;
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;
};

export function AnalysisReportAdvancedSections({
  analysisReport,
  showAdvancedReportSections,
  traceabilityMap,
  executableConstraints,
  releaseReview,
  domainKnowledge,
  qualityArtifacts,
  versionDiffDetailed,
}: AnalysisReportAdvancedSectionsProps) {
  const perPlatformRows = describeReleaseReviewPerPlatform(releaseReview?.perPlatform);
  return (
    <>
      {/* ── 8+ 高级段落（技术详情，默认折叠）── */}
      {showAdvancedReportSections && analysisReport.fileStats ? (
        <div className="info-box">
          <h3>分析范围</h3>
          <p>
            共 {analysisReport.fileStats.totalFiles} 个文件（文本 {analysisReport.fileStats.textFiles}，二进制 {analysisReport.fileStats.binaryFiles}）
            {analysisReport.fileSelection ? `，纳入分析 ${analysisReport.fileSelection.includedFiles}/${analysisReport.fileSelection.consideredFiles}` : ""}
            {analysisReport.fileSelection?.skippedNoiseFiles ? `，跳过噪声 ${analysisReport.fileSelection.skippedNoiseFiles}` : ""}
          </p>
          {analysisReport.deepInsights?.coverage ? (
            <p className="hint">
              深度覆盖率：{analysisReport.deepInsights.coverage.coveragePercent}%
              （{analysisReport.deepInsights.coverage.analyzedFiles}/{analysisReport.deepInsights.coverage.consideredFiles}）
            </p>
          ) : null}
        </div>
      ) : null}
      {showAdvancedReportSections && analysisReport.deepInsights?.fileInsights?.length ? (
        <div className="info-box">
          <h3>逐文件洞察</h3>
          <ul className="history-list findings-list">
            {analysisReport.deepInsights.fileInsights.map((fi, index) => (
              <li key={`fi-${fi.path}-${index}`} className="history-item history-item-stack">
                <strong>{fi.fileName}{fi.status !== "analyzed" ? `（${{ skipped: "已跳过", truncated: "已截断", error: "分析失败", failed: "分析失败", partial: "部分分析", pending: "待分析" }[fi.status] || fi.status}）` : ""}</strong>
                <p>{fi.summary || fi.mainContent || "-"}</p>
                {fi.iterationValue ? <p className="hint">迭代价值：{fi.iterationValue}</p> : null}
                {fi.risks?.length ? <p className="hint">风险：{fi.risks.join("；")}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showAdvancedReportSections && analysisReport.deepInsights?.crossFileInsights && (
        analysisReport.deepInsights.crossFileInsights.themes?.length ||
        analysisReport.deepInsights.crossFileInsights.conflicts?.length ||
        analysisReport.deepInsights.crossFileInsights.recommendations?.length
      ) ? (
        <div className="info-box">
          <h3>跨文件综合</h3>
          {analysisReport.deepInsights.crossFileInsights.themes?.length ? (
            <p>共性主题：{analysisReport.deepInsights.crossFileInsights.themes.join("；")}</p>
          ) : null}
          {analysisReport.deepInsights.crossFileInsights.conflicts?.length ? (
            <p>冲突点：{analysisReport.deepInsights.crossFileInsights.conflicts.join("；")}</p>
          ) : null}
          {analysisReport.deepInsights.crossFileInsights.recommendations?.length ? (
            <p>建议：{analysisReport.deepInsights.crossFileInsights.recommendations.join("；")}</p>
          ) : null}
        </div>
      ) : null}
      {showAdvancedReportSections && qualityArtifacts ? (
        <div className="info-box">
          <h3>测试与验收产物</h3>
          {(qualityArtifacts.acceptanceChecklist?.length ?? 0) > 0 ? (
            <p className="hint">验收清单：{qualityArtifacts.acceptanceChecklist.join("；")}</p>
          ) : (
            <p className="hint">验收清单：未生成</p>
          )}
          {(qualityArtifacts.unitTests?.length ?? 0) > 0 ? (
            <p className="hint">单测建议：{qualityArtifacts.unitTests.join("；")}</p>
          ) : null}
          {(qualityArtifacts.contractTests?.length ?? 0) > 0 ? (
            <p className="hint">契约测试建议：{qualityArtifacts.contractTests.join("；")}</p>
          ) : null}
          {(qualityArtifacts.regressionPoints?.length ?? 0) > 0 ? (
            <p className="hint">回归关注点：{qualityArtifacts.regressionPoints.join("；")}</p>
          ) : null}
          {(qualityArtifacts.materializedFiles?.length ?? 0) > 0 ? (
            <p className="hint">已落盘测试产物：{qualityArtifacts.materializedFiles.join("；")}</p>
          ) : null}
        </div>
      ) : null}
      {showAdvancedReportSections && traceabilityMap ? (
        <div className="info-box">
          <h3>需求-组件-代码映射</h3>
          <p>覆盖分：{traceabilityMap.coverageScore}%</p>
          <p>映射置信度：{{ high: "高", medium: "中", low: "低" }[traceabilityMap.mappingConfidence?.toLowerCase?.()] || traceabilityMap.mappingConfidence || "-"}</p>
          {traceabilityMap.gaps.length > 0 ? <p className="hint">缺口：{traceabilityMap.gaps.join("；")}</p> : null}
          {(traceabilityMap.unmappedRequirements?.length ?? 0) > 0 ? (
            <p className="hint">未映射需求：{traceabilityMap.unmappedRequirements.join("；")}</p>
          ) : null}
          {(traceabilityMap.conflicts?.length ?? 0) > 0 ? (
            <p className="hint">映射冲突：{traceabilityMap.conflicts.join("；")}</p>
          ) : null}
          {(traceabilityMap.requirementToCode?.length ?? 0) > 0 ? (
            <ul className="history-list">
              {traceabilityMap.requirementToCode.slice(0, 6).map((item, index) => (
                <li key={`${item.requirement}-${index}`} className="history-item">
                  <strong>{item.requirement}</strong>
                  <p>代码路径：{item.codePaths.join("；") || "-"}</p>
                  <p className="hint">依据：{item.evidence || "-"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">暂无可用三向映射，请先补齐需求、组件、代码路径边界。</p>
          )}
        </div>
      ) : null}
      {showAdvancedReportSections && executableConstraints ? (
        <div className="info-box">
          <h3>可执行边界约束</h3>
          <p>组件白名单：{executableConstraints.componentWhitelist.join("；") || "-"}</p>
          <p>代码路径白名单：{executableConstraints.codePathWhitelist.join("；") || "-"}</p>
          <p>验收约束：{executableConstraints.acceptanceChecks.join("；") || "-"}</p>
          {(executableConstraints.gateRules?.length ?? 0) > 0 ? (
            <p className="hint">门禁规则：{executableConstraints.gateRules.join("；")}</p>
          ) : null}
        </div>
      ) : null}
      {showAdvancedReportSections && releaseReview ? (
        <div className="info-box">
          <h3>发布前质量评审</h3>
          <p>结论：{{ go: "通过", caution: "有条件通过", block: "阻断" }[releaseReview.decision] || releaseReview.decision}</p>
          {perPlatformRows.length > 0 ? (
            <div className="release-review-per-platform">
              <p className="hint">按目标端评审：</p>
              <ul className="history-list">
                {perPlatformRows.map((row) => (
                  <li key={row.platform} className="history-item">
                    <strong>{TARGET_PLATFORM_LABELS[row.platform] ?? row.platform}：{row.decisionLabel}</strong>
                    <p className="hint">{row.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>原因：{releaseReview.reason || "-"}</p>
          <p>
            信号：用例 {releaseReview.qualitySignals.testCaseCount}，高优发现 {releaseReview.qualitySignals.p0FindingCount}，待确定信号{" "}
            {releaseReview.qualitySignals.unknownSignalCount}，边界覆盖 {releaseReview.qualitySignals.boundaryCoverage}%
          </p>
          {(releaseReview.blockers?.length ?? 0) > 0 ? <p className="hint">阻断项：{releaseReview.blockers.join("；")}</p> : null}
          {(releaseReview.releaseGates?.length ?? 0) > 0 ? <p className="hint">门禁：{releaseReview.releaseGates.join("；")}</p> : null}
          <p className="hint">
            回滚：{releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚"}
            {releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : ""}
          </p>
        </div>
      ) : null}
      {showAdvancedReportSections && domainKnowledge ? (
        <div className="info-box">
          <h3>领域知识抽取</h3>
          {(domainKnowledge.terms?.length ?? 0) > 0 ? (
            <ul className="history-list">
              {domainKnowledge.terms.slice(0, 6).map((item, index) => (
                <li key={`${item.term}-${index}`} className="history-item">
                  <strong>{item.term}</strong>
                  <p>{item.definition}</p>
                  <p className="hint">绑定路径：{item.mappedTo.codePaths.join("；") || "-"}</p>
                  <p className="hint">绑定强度：{{ high: "高", medium: "中", low: "低" }[item.bindingStrength?.toLowerCase?.()] || item.bindingStrength || "-"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">暂无术语抽取结果。</p>
          )}
          {(domainKnowledge.unknowns?.length ?? 0) > 0 ? <p className="hint">待确认：{domainKnowledge.unknowns.join("；")}</p> : null}
        </div>
      ) : null}
      {showAdvancedReportSections && versionDiffDetailed ? (
        <div className="info-box">
          <h3>版本差异细化评估</h3>
          <p>{versionDiffDetailed.summary}</p>
          {(versionDiffDetailed.impactScope?.length ?? 0) > 0 ? (
            <p className="hint">影响面：{versionDiffDetailed.impactScope.join("；")}</p>
          ) : null}
          {(versionDiffDetailed.riskPoints?.length ?? 0) > 0 ? (
            <p className="hint">高风险点：{versionDiffDetailed.riskPoints.join("；")}</p>
          ) : null}
        </div>
      ) : null}
      {showAdvancedReportSections && analysisReport.reportQuality ? (
        <div className="info-box">
          <h3>报告可靠度</h3>
          <p>
            质量评分：{analysisReport.reportQuality.score}/100
            {analysisReport.reportQuality.publishable ? "（可发布）" : "（不建议直接发布）"}
          </p>
          {analysisReport.reportQuality.summary ? <p className="hint">{analysisReport.reportQuality.summary}</p> : null}
          {analysisReport.reportQuality.missingItems?.length ? (
            <p className="hint">缺失项：{analysisReport.reportQuality.missingItems.join("；")}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
