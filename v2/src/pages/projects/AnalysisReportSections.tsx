import type { AttachmentAnalysisReport, Iteration } from "./iterationWorkspacePanelTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";

const GUIDANCE_ICON: Record<CoachGuidanceItem["icon"], string> = {
  alert: "\u26A0\uFE0F",
  chat: "\uD83D\uDCAC",
  check: "\u2705",
  info: "\u2139\uFE0F"
};

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
  const bc = businessConfirmation;
  const checklist = bc?.confirmationChecklist ?? [];
  const sortedChecklist = [...checklist].sort((a, b) => {
    const rank = (level: string) => (level === "高" ? 0 : level === "中" ? 1 : 2);
    return rank(a.impactLevel) - rank(b.impactLevel);
  });
  const necessity = bc?.necessityAssessment;

  return (
    <>
      {/* ── 1. 项目概要确认 ── */}
      <div className="info-box">
        <h3>项目概要确认</h3>
        <div className={`report-confirmation-banner ${reportPendingConfirmation ? "pending" : "confirmed"}`}>
          {reportPendingConfirmation
            ? "状态：待你确认（当前为初始理解）"
            : `状态：已确认${reportConfirmedAt ? `（${new Date(reportConfirmedAt).toLocaleString("zh-CN")}）` : ""}`}
        </div>
        <p>项目：{analysisReport.projectDetection?.projectName || analysisReport.iterationName}</p>
        <p>产品：{analysisReport.projectDetection?.productName || analysisReport.iterationName}</p>
        <p>项目类型：{analysisReport.projectDetection?.projectCategory || analysisReport.attachmentInsights.projectCategory}</p>
        {bc?.coreIntent ? <p>核心意图：{bc.coreIntent}</p> : <p>初始理解：{analysisReport.understanding}</p>}
        {!reportPendingConfirmation && confirmedUnderstanding ? (
          <p>确认后理解：{confirmedUnderstanding}</p>
        ) : null}
        <p className="hint">如以上定位存在偏差，请直接在对话中输入"理解偏差：..."进行纠正。</p>
      </div>

      {/* ── 2. 确认清单（替代硬编码出发点确认）── */}
      <div className="info-box">
        <h3>确认清单</h3>
        {bc?.successCriteria && bc.successCriteria.length > 0 ? (
          <>
            <p className="hint">成功标准：</p>
            <ul className="history-list">
              {bc.successCriteria.map((item, index) => (
                <li key={`sc-${index}`} className="history-item"><p>{item}</p></li>
              ))}
            </ul>
          </>
        ) : null}
        {sortedChecklist.length > 0 ? (
          <ul className="history-list">
            {sortedChecklist.map((item, index) => (
              <li key={`ck-${index}`} className="history-item">
                <strong>[{item.impactLevel}] {item.item}</strong>
                <p className="hint">{item.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="history-list">
            <li className="history-item"><p>1. 本轮核心目标是否与当前理解一致？</p></li>
            <li className="history-item"><p>2. 新增版本边界是否完整覆盖你要交付的内容？</p></li>
            <li className="history-item"><p>3. 是否有关键约束/成功标准尚未纳入？</p></li>
          </ul>
        )}
        <p className="hint">直接在对话中输入"确认一致"或"偏差点：..."即可。</p>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => onChatSend({ overrideText: "确认一致" })}>
            发送：确认一致
          </button>
          <button type="button" className="btn ghost mini" onClick={() => onChatInputChange("偏差点：")}>
            填入：偏差点
          </button>
        </div>
      </div>

      {/* ── 2.5 需要你补充的信息 ── */}
      {(analysisReport.clarificationQuestions?.length || analysisReport.deepInsights?.crossFileInsights?.gaps?.length) ? (
        <div className="info-box">
          <h3>需要你补充的信息</h3>
          <p className="hint">以下内容影响后续分析准确度，请在对话中逐一回复。</p>
          <ul className="history-list findings-list">
            {(analysisReport.clarificationQuestions || []).map((q, index) => (
              <li key={`cq-${index}`} className="history-item history-item-stack">
                <p>{index + 1}. {q}</p>
              </li>
            ))}
            {(analysisReport.deepInsights?.crossFileInsights?.gaps || []).map((g, index) => (
              <li key={`gap-${index}`} className="history-item history-item-stack">
                <p>{(analysisReport.clarificationQuestions?.length || 0) + index + 1}. {g}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 3. 必要性评估 ── */}
      {necessity && (necessity.mustDo.length > 0 || necessity.shouldDo.length > 0 || necessity.canDefer.length > 0) ? (
        <div className="info-box">
          <h3>必要性评估</h3>
          {necessity.mustDo.length > 0 ? (
            <>
              <p><strong>必须做</strong></p>
              <ul className="history-list">
                {necessity.mustDo.map((item, i) => <li key={`must-${i}`} className="history-item"><p>{item}</p></li>)}
              </ul>
            </>
          ) : null}
          {necessity.shouldDo.length > 0 ? (
            <>
              <p><strong>应该做</strong></p>
              <ul className="history-list">
                {necessity.shouldDo.map((item, i) => <li key={`should-${i}`} className="history-item"><p>{item}</p></li>)}
              </ul>
            </>
          ) : null}
          {necessity.canDefer.length > 0 ? (
            <>
              <p><strong>可延后</strong></p>
              <ul className="history-list">
                {necessity.canDefer.map((item, i) => <li key={`defer-${i}`} className="history-item"><p>{item}</p></li>)}
              </ul>
            </>
          ) : null}
          {necessity.outOfScope.length > 0 ? (
            <>
              <p><strong>不在本轮范围</strong></p>
              <ul className="history-list">
                {necessity.outOfScope.map((item, i) => <li key={`out-${i}`} className="history-item"><p>{item}</p></li>)}
              </ul>
            </>
          ) : null}
          {necessity.rationale ? <p className="hint">{necessity.rationale}</p> : null}
        </div>
      ) : null}

      {/* ── 4. 功能要点 ── */}
      {bc?.functionalPoints && bc.functionalPoints.length > 0 ? (
        <div className="info-box">
          <h3>功能要点</h3>
          <ul className="history-list">
            {bc.functionalPoints.map((item, index) => (
              <li key={`fp-${index}`} className="history-item"><p>{item}</p></li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 5. 版本内容边界 ── */}
      <div className="info-box">
        <h3>版本内容边界</h3>
        <p>需求边界：{currentIteration?.changeControl?.boundary?.requirementRefs?.join("；") || "未明确（请在对话中继续澄清）"}</p>
        <p>组件边界：{currentIteration?.changeControl?.boundary?.componentRefs?.join("；") || "未明确（请在对话中继续澄清）"}</p>
        <p>代码边界：{currentIteration?.changeControl?.boundary?.codePaths?.join("；") || "未明确（请在对话中继续澄清）"}</p>
        {currentIteration?.changeControl?.boundary?.note ? <p>边界说明：{currentIteration.changeControl.boundary.note}</p> : null}
        {bc?.boundarySummary ? <p className="hint">{bc.boundarySummary}</p> : null}
      </div>

      {/* ── 6. 关键发现 ── */}
      {visiblePrioritizedFindings.length > 0 ? (
        <div className="info-box">
          <div className="panel-head">
            <h3>关键发现</h3>
            <button type="button" className="btn ghost mini" onClick={() => setOnlyHighValue((prev) => !prev)}>
              {onlyHighValue ? "显示全部" : "仅看高价值"}
            </button>
          </div>
          {visiblePrioritizedFindings.filter(f => f.priority === "P0").length > 0 ? (
            <>
              <p className="label-hint">需要立即关注</p>
              <ul className="history-list findings-list">
                {visiblePrioritizedFindings.filter(f => f.priority === "P0").map((item, index) => (
                  <li key={`p0-${item.content}-${index}`} className="history-item history-item-stack">
                    <strong>{item.content}</strong>
                    {item.reason ? <p className="hint">{item.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {visiblePrioritizedFindings.filter(f => f.priority === "P1").length > 0 ? (
            <>
              <p className="label-hint">建议本轮处理</p>
              <ul className="history-list findings-list">
                {visiblePrioritizedFindings.filter(f => f.priority === "P1").map((item, index) => (
                  <li key={`p1-${item.content}-${index}`} className="history-item history-item-stack">
                    <strong>{item.content}</strong>
                    {item.reason ? <p className="hint">{item.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {visiblePrioritizedFindings.filter(f => f.priority === "P2").length > 0 ? (
            <>
              <p className="label-hint">后续可优化</p>
              <ul className="history-list findings-list">
                {visiblePrioritizedFindings.filter(f => f.priority === "P2").map((item, index) => (
                  <li key={`p2-${item.content}-${index}`} className="history-item history-item-stack">
                    <strong>{item.content}</strong>
                    {item.reason ? <p className="hint">{item.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── 6.5 迭代方向建议 ── */}
      {(analysisReport.nextActions?.length || analysisReport.suggestions?.length || analysisReport.risks?.length) ? (
        <div className="info-box">
          <h3>迭代方向建议</h3>
          {analysisReport.nextActions?.length ? (
            <ul className="history-list findings-list">
              {analysisReport.nextActions.map((a, i) => (
                <li key={`na-${i}`} className="history-item history-item-stack"><p>{a}</p></li>
              ))}
            </ul>
          ) : null}
          {analysisReport.risks?.length ? (
            <>
              <p className="label-hint">注意事项</p>
              <ul className="history-list">
                {analysisReport.risks.map((r, i) => (
                  <li key={`risk-${i}`} className="history-item history-item-stack"><p>{r}</p></li>
                ))}
              </ul>
            </>
          ) : null}
          {analysisReport.suggestions?.length ? (
            <>
              <p className="label-hint">改进建议</p>
              <ul className="history-list">
                {analysisReport.suggestions.map((s, i) => (
                  <li key={`sug-${i}`} className="history-item history-item-stack"><p>{s}</p></li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── 7. 教练引导（替代"建议确认动作"）── */}
      {coachGuidance.length > 0 ? (
        <div className="info-box">
          <h3>教练引导</h3>
          <ul className="history-list">
            {coachGuidance.map((item, index) => (
              <li key={`cg-${index}`} className="history-item">
                <p>{GUIDANCE_ICON[item.icon]} {item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
