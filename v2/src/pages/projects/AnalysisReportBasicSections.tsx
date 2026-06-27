/**
 * 分析报告基础段落 —— 项目概要、确认清单、补充信息、必要性评估、功能要点、版本边界、关键发现、迭代方向、教练引导。
 * 这些段落始终展示，不受 showAdvancedReportSections 控制。
 */

import type { AttachmentAnalysisReport, Iteration } from "./iterationWorkspacePanelTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";

const GUIDANCE_ICON: Record<CoachGuidanceItem["icon"], string> = {
  alert: "⚠️",
  chat: "💬",
  check: "✅",
  info: "ℹ️"
};

export type AnalysisReportBasicSectionsProps = {
  analysisReport: AttachmentAnalysisReport;
  currentIteration: Iteration | null;
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"] | null;
  coachGuidance: CoachGuidanceItem[];
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  onChatInputChange: (value: string) => void;
  onChatSend: (options?: { overrideText?: string }) => Promise<unknown>;
};

export function AnalysisReportBasicSections({
  analysisReport,
  currentIteration,
  reportPendingConfirmation,
  reportConfirmedAt,
  confirmedUnderstanding,
  onlyHighValue,
  visiblePrioritizedFindings,
  businessConfirmation,
  coachGuidance,
  setOnlyHighValue,
  onChatInputChange,
  onChatSend,
}: AnalysisReportBasicSectionsProps) {
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
    </>
  );
}
