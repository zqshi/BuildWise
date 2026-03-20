import type { AttachmentAnalysisReport, Iteration } from "./iterationWorkspacePanelTypes";

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
  setOnlyHighValue,
  onChatInputChange,
  onChatSend,
}: AnalysisReportSectionsProps) {
  return (
    <>
      <div className="info-box">
        <h3>项目概要确认（避免理解偏差）</h3>
        <div className={`report-confirmation-banner ${reportPendingConfirmation ? "pending" : "confirmed"}`}>
          {reportPendingConfirmation
            ? "状态：待你确认（当前为初始理解）"
            : `状态：已确认${reportConfirmedAt ? `（${new Date(reportConfirmedAt).toLocaleString("zh-CN")}）` : ""}`}
        </div>
        <p>项目：{analysisReport.projectDetection?.projectName || analysisReport.iterationName}</p>
        <p>产品：{analysisReport.projectDetection?.productName || analysisReport.iterationName}</p>
        <p>项目类型：{analysisReport.projectDetection?.projectCategory || analysisReport.attachmentInsights.projectCategory}</p>
        <p>初始理解：{analysisReport.understanding}</p>
        {!reportPendingConfirmation ? (
          <p>确认后理解：{confirmedUnderstanding || analysisReport.understanding}</p>
        ) : null}
        <p className="hint">如以上定位存在偏差，请直接在 IM 输入"理解偏差：..."进行纠正，系统会按你的反馈继续收敛。</p>
      </div>
      <div className="info-box">
        <h3>项目主要内容与特点</h3>
        <p>项目主内容：{analysisReport.projectDetection?.projectName || analysisReport.iterationName}</p>
        <p>产品主线：{analysisReport.projectDetection?.productName || analysisReport.iterationName}</p>
        <p>附件特点：{analysisReport.attachmentInsights.artifactType || "未识别"}</p>
        <p>关键特征：{(analysisReport.attachmentInsights.keyCharacteristics || []).join("；") || "暂无"}</p>
        <p className="hint">分析时间：{new Date(analysisReport.analyzedAt).toLocaleString("zh-CN")}</p>
      </div>
      <div className="info-box">
        <h3>出发点确认（请在 IM 回复）</h3>
        <ul className="history-list">
          <li className="history-item"><p>1. 本轮核心目标是否与当前理解一致？</p></li>
          <li className="history-item"><p>2. 新增版本边界是否完整覆盖你要交付的内容？</p></li>
          <li className="history-item"><p>3. 是否有关键约束/成功标准尚未纳入？</p></li>
        </ul>
        <p className="hint">直接在 IM 输入"确认一致"或"偏差点：..."即可，系统会基于你的反馈继续收敛。</p>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => onChatSend({ overrideText: "确认一致" })}>
            发送：确认一致
          </button>
          <button type="button" className="btn ghost mini" onClick={() => onChatInputChange("偏差点：")}>
            填入：偏差点
          </button>
        </div>
      </div>
      <div className="info-box">
        <h3>新增版本内容边界范围</h3>
        <p>需求边界：{currentIteration?.changeControl?.boundary?.requirementRefs?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
        <p>组件边界：{currentIteration?.changeControl?.boundary?.componentRefs?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
        <p>代码边界：{currentIteration?.changeControl?.boundary?.codePaths?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
        {currentIteration?.changeControl?.boundary?.note ? <p>边界说明：{currentIteration.changeControl.boundary.note}</p> : null}
      </div>
      {(analysisReport.meaningfulFindings?.length ?? 0) > 0 ? (
        <div className="info-box">
          <h3>关键发现</h3>
          <ul className="history-list">
            {(analysisReport.meaningfulFindings || []).map((item, index) => (
              <li key={`${item}-${index}`} className="history-item">
                <p>{item}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {visiblePrioritizedFindings.length > 0 ? (
        <div className="info-box">
          <div className="panel-head">
            <h3>优先级发现</h3>
            <button type="button" className="btn ghost mini" onClick={() => setOnlyHighValue((prev) => !prev)}>
              {onlyHighValue ? "显示全部" : "仅看高价值"}
            </button>
          </div>
          <ul className="history-list">
            {visiblePrioritizedFindings.map((item, index) => (
              <li key={`${item.priority}-${item.content}-${index}`} className="history-item">
                <strong>{item.priority}</strong>
                <p>{item.content}</p>
                <p className="hint">{item.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(analysisReport.nextActions?.length ?? 0) > 0 ? (
        <div className="info-box">
          <h3>建议确认动作</h3>
          <ul className="history-list">
            {(analysisReport.nextActions || []).map((item, index) => (
              <li key={`${item}-${index}`} className="history-item">
                <p>{item}</p>
              </li>
            ))}
          </ul>
          <p className="hint">请在 IM 中逐项确认或修正，系统会按你的反馈更新理解与边界。</p>
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
          <p>映射置信度：{traceabilityMap.mappingConfidence?.toUpperCase?.() || "-"}</p>
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
                  <p className="hint">evidence：{item.evidence || "-"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">暂无可用三向映射，请先补齐 requirement/component/codePath 边界。</p>
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
          <p>结论：{releaseReview.decision.toUpperCase()}</p>
          <p>原因：{releaseReview.reason || "-"}</p>
          <p>
            信号：用例 {releaseReview.qualitySignals.testCaseCount}，P0 {releaseReview.qualitySignals.p0FindingCount}，unknown{" "}
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
                  <p className="hint">绑定强度：{item.bindingStrength?.toUpperCase?.() || "-"}</p>
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
    </>
  );
}
