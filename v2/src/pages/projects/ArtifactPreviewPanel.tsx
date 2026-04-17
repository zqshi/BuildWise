import { lazy, Suspense } from "react";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import type { ArtifactPreviewKind, HtmlPreviewInteractionPayload, HtmlPreviewHistoryItem } from "./iterationWorkspacePanelTypes";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import type { AttachmentAnalysisReport } from "./iterationWorkspacePanelTypes";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";
import { stripRichTextToPlainText } from "./artifactEditorModel";

const ArtifactTextEditor = lazy(async () => {
  const module = await import("./ArtifactEditorWidgets");
  return { default: module.ArtifactTextEditor };
});

const ArtifactCodeViewer = lazy(async () => {
  const module = await import("./ArtifactEditorWidgets");
  return { default: module.ArtifactCodeViewer };
});

export type ArtifactPreviewPanelProps = {
  selectedDrawerArtifact: IterationArtifactWorkflowItem;
  selectedArtifactKind: ArtifactPreviewKind | null;
  artifactEditorValue: string;
  artifactEditorDirty: boolean;
  artifactEditorBusy: boolean;
  artifactEditorMode: "view" | "edit";
  artifactEditorSource: string;
  canEditSelectedTextArtifact: boolean;
  analysisDraftSections: AnalysisArtifactSection[];
  artifactDraftContent: string;
  selectedArtifactHtmlPreview: string;
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  interactionEditMode: boolean;
  htmlPreviewHistory: HtmlPreviewHistoryItem[];
  interactionInstruction: string;
  analysisReport: AttachmentAnalysisReport | null;
  generatedTestMatrix: IterationGeneratedTestCase[];
  currentIteration: { changeControl?: { lastReleaseReviewDecision?: string; lastReleaseReviewReason?: string; qualityArtifacts?: { materializedFiles?: string[] } } } | null;
  imagePrototypePreviews: UploadedAttachmentMeta["imagePreviews"];
  coachGuidance: CoachGuidanceItem[];
  artifactHtmlPreviewFrameRef: React.RefObject<HTMLIFrameElement>;
  handleSaveArtifactEditor: () => Promise<void>;
  handleSubmitArtifactForReview: () => Promise<void>;
  handleUndoHtmlPreview: () => void;
  sendInteractionInstruction: (instruction: string) => Promise<void> | void;
  setArtifactEditorValue: React.Dispatch<React.SetStateAction<string>>;
  setArtifactEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setArtifactEditorMode: React.Dispatch<React.SetStateAction<"view" | "edit">>;
  setInteractionEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInteractionInstruction: React.Dispatch<React.SetStateAction<string>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
};

function ArtifactEditorFallback() {
  return <div className="artifact-drawer-empty">正在加载编辑器...</div>;
}

export function ArtifactPreviewPanel({
  selectedDrawerArtifact,
  selectedArtifactKind,
  artifactEditorValue,
  artifactEditorDirty,
  artifactEditorBusy,
  artifactEditorMode,
  artifactEditorSource,
  canEditSelectedTextArtifact,
  analysisDraftSections: _analysisDraftSections,
  artifactDraftContent,
  selectedArtifactHtmlPreview,
  selectedHtmlPreview,
  selectedHtmlElement,
  interactionEditMode,
  htmlPreviewHistory,
  interactionInstruction,
  analysisReport,
  generatedTestMatrix,
  currentIteration,
  imagePrototypePreviews,
  coachGuidance,
  artifactHtmlPreviewFrameRef,
  handleSaveArtifactEditor,
  handleSubmitArtifactForReview,
  handleUndoHtmlPreview,
  sendInteractionInstruction,
  setArtifactEditorValue,
  setArtifactEditorDirty,
  setArtifactEditorMode,
  setInteractionEditMode,
  setInteractionInstruction,
  setChangeControlNotice,
}: ArtifactPreviewPanelProps) {
  const renderTextArtifactActions = () => (
    <>
      {artifactEditorMode === "edit" ? (
        <>
          <button
            type="button"
            className="btn ghost mini"
            onClick={() => {
              setArtifactEditorValue(artifactEditorSource);
              setArtifactEditorDirty(false);
              setArtifactEditorMode("view");
            }}
            disabled={artifactEditorBusy}
          >
            结束编辑
          </button>
          <button
            type="button"
            className="btn ghost mini"
            onClick={() => {
              setArtifactEditorValue(artifactEditorSource);
              setArtifactEditorDirty(false);
            }}
            disabled={!artifactEditorDirty || artifactEditorBusy}
          >
            重置
          </button>
          <button
            type="button"
            className="btn primary mini"
            onClick={() => void handleSaveArtifactEditor()}
            disabled={!artifactEditorDirty || artifactEditorBusy}
          >
            {artifactEditorBusy ? "保存中..." : "保存草稿"}
          </button>
        </>
      ) : canEditSelectedTextArtifact ? (
        <button type="button" className="btn ghost mini" onClick={() => setArtifactEditorMode("edit")} disabled={artifactEditorBusy}>
          编辑
        </button>
      ) : null}
      <button type="button" className="btn ghost mini" onClick={() => void handleSubmitArtifactForReview()} disabled={artifactEditorBusy}>
        提交确认
      </button>
    </>
  );

  return (
    <Suspense fallback={<ArtifactEditorFallback />}>
      <div className="deliverable-preview-focus">
      {selectedDrawerArtifact?.stale && (selectedDrawerArtifact?.outputVersion ?? 0) > 0 && (
        <div style={{
          padding: "6px 12px",
          background: "#fff8e6",
          border: "1px solid #f0d060",
          borderRadius: 4,
          fontSize: 12,
          color: "#8a6d00",
          marginBottom: 8
        }}>
          上游交付物已更新，此内容可能需要重新生成。
        </div>
      )}
      {selectedArtifactKind === "analysis-report" ? (
        analysisReport ? (
          <>
            {/* ── 项目识别 ── */}
            <div className="deliverable-kv-grid">
                  <div>
                    <span>项目</span>
                    <strong>{analysisReport.projectDetection?.projectName || "-"}</strong>
                  </div>
                  <div>
                    <span>产品</span>
                    <strong>{analysisReport.projectDetection?.productName || "-"}</strong>
                  </div>
                  <div>
                    <span>类型</span>
                    <strong>{analysisReport.projectDetection?.projectCategory || "-"}</strong>
                  </div>
                  <div>
                    <span>分析时间</span>
                    <strong>{analysisReport.analyzedAt ? new Date(analysisReport.analyzedAt).toLocaleString("zh-CN") : "-"}</strong>
                  </div>
                </div>

                {/* ── 理解摘要 ── */}
                <section className="deliverable-section">
                  <h4>我的理解</h4>
                  <p>{analysisReport.understanding || selectedDrawerArtifact.summary || "-"}</p>
                </section>

                {/* ── 关键发现（按业务影响分组）── */}
                {analysisReport.prioritizedFindings?.length ? (
                  <section className="deliverable-section">
                    <h4>关键发现</h4>
                    {analysisReport.prioritizedFindings.filter(f => f.priority === "P0").length > 0 ? (
                      <>
                        <p className="label-hint">需要立即关注</p>
                        <ul className="history-list findings-list">
                          {analysisReport.prioritizedFindings.filter(f => f.priority === "P0").map((item, i) => (
                            <li key={`p0-${i}`} className="history-item history-item-stack">
                              <strong>{item.content}</strong>
                              {item.reason ? <p className="hint">{item.reason}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {analysisReport.prioritizedFindings.filter(f => f.priority === "P1").length > 0 ? (
                      <>
                        <p className="label-hint">建议本轮处理</p>
                        <ul className="history-list findings-list">
                          {analysisReport.prioritizedFindings.filter(f => f.priority === "P1").map((item, i) => (
                            <li key={`p1-${i}`} className="history-item history-item-stack">
                              <strong>{item.content}</strong>
                              {item.reason ? <p className="hint">{item.reason}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {analysisReport.prioritizedFindings.filter(f => f.priority === "P2").length > 0 ? (
                      <>
                        <p className="label-hint">后续可优化</p>
                        <ul className="history-list findings-list">
                          {analysisReport.prioritizedFindings.filter(f => f.priority === "P2").map((item, i) => (
                            <li key={`p2-${i}`} className="history-item history-item-stack">
                              <strong>{item.content}</strong>
                              {item.reason ? <p className="hint">{item.reason}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </section>
                ) : null}

                {/* ── 需要补充的信息 ── */}
                {(analysisReport.clarificationQuestions?.length || analysisReport.deepInsights?.crossFileInsights?.gaps?.length) ? (
                  <section className="deliverable-section">
                    <h4>需要你补充的信息</h4>
                    <ul className="history-list findings-list">
                      {(analysisReport.clarificationQuestions || []).map((q, i) => (
                        <li key={`cq-${i}`} className="history-item history-item-stack">
                          <p>{q}</p>
                        </li>
                      ))}
                      {(analysisReport.deepInsights?.crossFileInsights?.gaps || []).map((g, i) => (
                        <li key={`gap-${i}`} className="history-item history-item-stack">
                          <p>{g}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">请在对话中逐一回复，以便进入下一步。</p>
                  </section>
                ) : null}

                {/* ── 迭代方向建议 ── */}
                {(analysisReport.nextActions?.length || analysisReport.suggestions?.length || analysisReport.risks?.length) ? (
                  <section className="deliverable-section">
                    <h4>迭代方向建议</h4>
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
                  </section>
                ) : null}

                {/* ── 教练引导 ── */}
                <section className="deliverable-section">
                  <h4>教练引导</h4>
                  {coachGuidance.length > 0 ? (
                    <ul className="history-list">
                      {coachGuidance.slice(0, 4).map((item, index) => (
                        <li key={`cg-${index}`} className="history-item">
                          <p>{item.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">暂无教练引导。</p>
                  )}
                </section>
              </>
            ) : artifactDraftContent.trim() ? (
              <ArtifactTextEditor
                title={`分析报告 · v${selectedDrawerArtifact.outputVersion}`}
                value={artifactDraftContent}
                profile="generic"
                readOnly
                showTitle={false}
                actions={null}
              />
            ) : (
              <p className="hint">当前迭代暂无分析报告内容。</p>
            )
      ) : null}
      {selectedArtifactKind === "product-requirements-doc" ? (
        artifactEditorValue.trim() ? (
        <ArtifactTextEditor
          title={`PRD · v${selectedDrawerArtifact.outputVersion}`}
          value={artifactEditorValue}
          profile="prd"
          readOnly={artifactEditorMode !== "edit"}
          showTitle={false}
          onChange={(value) => {
            setArtifactEditorValue(value);
            setArtifactEditorDirty(value !== artifactEditorSource);
          }}
          actions={renderTextArtifactActions()}
        />
        ) : (
          <p className="hint">正在生成中，请稍候...</p>
        )
      ) : null}
      {selectedArtifactKind === "html-prototype" ? (
        <div className="artifact-drawer-composer artifact-drawer-composer-prototype">
          <div className="artifact-prototype-toolbar">
            <span className="hint">
              数据源：{artifactDraftContent.trim() ? "交付物草稿" : selectedHtmlPreview ? `上传预览（${selectedHtmlPreview.name}）` : "暂无可渲染原型"}
            </span>
            <div className="chat-tools">
              <button type="button" className={`btn ghost mini ${interactionEditMode ? "is-active" : ""}`} onClick={() => setInteractionEditMode((prev) => !prev)}>
                {interactionEditMode ? "退出选中" : "选择元素"}
              </button>
              <button type="button" className="btn ghost mini" onClick={handleUndoHtmlPreview} disabled={htmlPreviewHistory.length === 0}>
                撤销
              </button>
            </div>
          </div>
          {selectedArtifactHtmlPreview ? (
            <div className="artifact-prototype-editor">
              <iframe
                ref={artifactHtmlPreviewFrameRef}
                title={`${selectedDrawerArtifact.title}-preview`}
                sandbox="allow-scripts"
                srcDoc={selectedArtifactHtmlPreview}
                className="artifact-prototype-frame"
              />
              <div className="interaction-inline-editor artifact-inline-editor">
                <span className="interaction-target-chip">{selectedHtmlElement?.selector || "未选中元素"}</span>
                <input
                  value={interactionInstruction}
                  onChange={(event) => setInteractionInstruction(event.target.value)}
                  placeholder={interactionEditMode ? "先点选原型元素，再用自然语言描述想修改的文案、尺寸或样式" : "点击\u201c选择元素\u201d后再描述想修改的内容"}
                />
                <button
                  type="button"
                  className="btn primary mini"
                  onClick={() => {
                    void sendInteractionInstruction(interactionInstruction);
                    setInteractionInstruction("");
                  }}
                  disabled={!interactionInstruction.trim() || !selectedHtmlElement}
                >
                  发送
                </button>
              </div>
            </div>
          ) : (
            <p className="hint">暂无原型内容，请在主对话中要求 Agent 生成或调整当前原型交付物。</p>
          )}
          {imagePrototypePreviews.length > 0 ? (
            <p className="hint">已检测到图片原型 {imagePrototypePreviews.length} 份，可在交互界面中继续编辑。</p>
          ) : null}
        </div>
      ) : null}
      {selectedArtifactKind === "design-spec" ? (
        artifactEditorValue.trim() ? (
        <ArtifactTextEditor
          title={`设计规范 · ${selectedDrawerArtifact.stage}`}
          value={artifactEditorValue}
          profile="design-spec"
          readOnly={artifactEditorMode !== "edit"}
          showTitle={false}
          onChange={(value) => {
            setArtifactEditorValue(value);
            setArtifactEditorDirty(value !== artifactEditorSource);
          }}
          actions={renderTextArtifactActions()}
        />
        ) : (
          <p className="hint">正在生成中，请稍候...</p>
        )
      ) : null}
      {selectedArtifactKind === "technical-architecture" ? (
        artifactEditorValue.trim() ? (
        <ArtifactTextEditor
          title={`技术架构 · ${selectedDrawerArtifact.stage}`}
          value={artifactEditorValue}
          profile="technical-architecture"
          readOnly={artifactEditorMode !== "edit"}
          showTitle={false}
          onChange={(value) => {
            setArtifactEditorValue(value);
            setArtifactEditorDirty(value !== artifactEditorSource);
          }}
          actions={renderTextArtifactActions()}
        />
        ) : (
          <p className="hint">正在生成中，请稍候...</p>
        )
      ) : null}
      {selectedArtifactKind === "code" ? (
        <ArtifactCodeViewer
          title={selectedDrawerArtifact.title}
          value={artifactDraftContent || selectedDrawerArtifact.summary || "暂无代码内容"}
          actions={(
            <button
              type="button"
              className="btn ghost mini"
              onClick={() => {
                void navigator.clipboard.writeText(stripRichTextToPlainText(artifactDraftContent || selectedDrawerArtifact.summary || ""));
                setChangeControlNotice("代码内容已复制。");
              }}
            >
              复制代码
            </button>
          )}
        />
      ) : null}
      {selectedArtifactKind === "test-cases" ? (
        artifactDraftContent.trim() ? (
          <ArtifactTextEditor title={selectedDrawerArtifact.title} value={artifactDraftContent} profile="test-cases" readOnly showTitle={false} />
        ) : generatedTestMatrix.length > 0 ? (
          <div className="artifact-drawer-structured-content">
            <ul className="history-list">
              {generatedTestMatrix.slice(0, 10).map((item) => (
                <li key={`${item.caseId}-drawer`} className="history-item">
                  <strong>
                    [{item.type}] {item.caseId}
                  </strong>
                  <p>预期：{item.expected || "-"}</p>
                  <p className="hint">状态：{{ pending: "待执行", passed: "已通过", failed: "未通过", blocked: "阻塞", skipped: "已跳过" }[item.executionStatus] || item.executionStatus || "待执行"}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hint">当前无测试矩阵数据。</p>
        )
      ) : null}
      {selectedArtifactKind === "release-review" ? (
        artifactDraftContent.trim() ? (
          <ArtifactTextEditor title={selectedDrawerArtifact.title} value={artifactDraftContent} profile="release-review" readOnly showTitle={false} />
        ) : (
          <div className="artifact-drawer-structured-content">
            <p>最近结论：{{ go: "通过", caution: "有条件通过", block: "阻断" }[currentIteration?.changeControl?.lastReleaseReviewDecision ?? ""] || currentIteration?.changeControl?.lastReleaseReviewDecision || "-"}</p>
            <p className="hint">说明：{currentIteration?.changeControl?.lastReleaseReviewReason || "-"}</p>
          </div>
        )
      ) : null}
      {selectedArtifactKind === "delivery-package" ? (
        artifactDraftContent.trim() ? (
          <ArtifactTextEditor title={selectedDrawerArtifact.title} value={artifactDraftContent} profile="delivery-package" readOnly showTitle={false} />
        ) : (
          <div className="artifact-drawer-structured-content">
            <p className="hint">
              已落盘文件：{currentIteration?.changeControl?.qualityArtifacts?.materializedFiles?.join("；") || "暂无"}
            </p>
          </div>
        )
      ) : null}
      {selectedArtifactKind === "document" ? (
        artifactEditorValue.trim() ? (
        <ArtifactTextEditor
          title={selectedDrawerArtifact.title}
          value={artifactEditorValue}
          profile="generic"
          readOnly={artifactEditorMode !== "edit"}
          showTitle={false}
          onChange={(value) => {
            setArtifactEditorValue(value);
            setArtifactEditorDirty(value !== artifactEditorSource);
          }}
          actions={renderTextArtifactActions()}
        />
        ) : (
          <p className="hint">正在生成中，请稍候...</p>
        )
      ) : null}
      </div>
    </Suspense>
  );
}
