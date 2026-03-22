import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import type { ArtifactPreviewKind, HtmlPreviewInteractionPayload, HtmlPreviewHistoryItem } from "./iterationWorkspacePanelTypes";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import type { AttachmentAnalysisReport } from "./iterationWorkspacePanelTypes";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import { ArtifactCodeViewer, ArtifactTextEditor } from "./ArtifactEditorWidgets";
import { stripRichTextToPlainText } from "./artifactEditorModel";

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

export function ArtifactPreviewPanel({
  selectedDrawerArtifact,
  selectedArtifactKind,
  artifactEditorValue,
  artifactEditorDirty,
  artifactEditorBusy,
  artifactEditorMode,
  artifactEditorSource,
  canEditSelectedTextArtifact,
  analysisDraftSections,
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
    <div className="deliverable-preview-focus">
      {selectedArtifactKind === "analysis-report" ? (
        artifactDraftContent.trim() ? (
          <ArtifactTextEditor title={selectedDrawerArtifact.title} value={artifactDraftContent} readOnly showTitle={false} />
        ) : (
          <div className="artifact-drawer-structured-content">
            {analysisDraftSections.length > 0 ? (
              <>
                <div className="deliverable-kv-grid">
                  {analysisDraftSections.slice(0, 4).map((section) => (
                    <div key={`analysis-section-${section.title}`}>
                      <span>{section.title}</span>
                      <strong>{section.content || (section.bullets[0] ?? "-")}</strong>
                    </div>
                  ))}
                </div>
                {analysisDraftSections.slice(4).map((section, index) => (
                  <section key={`analysis-draft-${section.title}-${index}`} className="deliverable-section">
                    <h4>{section.title}</h4>
                    {section.content ? <p style={{ whiteSpace: "pre-wrap" }}>{section.content}</p> : null}
                    {section.bullets.length > 0 ? (
                      <ul className="history-list">
                        {section.bullets.map((item, bulletIndex) => (
                          <li key={`${section.title}-${bulletIndex}`} className="history-item">
                            <p>{item}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </>
            ) : analysisReport ? (
              <>
                <div className="deliverable-kv-grid">
                  <div>
                    <span>项目识别</span>
                    <strong>{analysisReport.projectDetection?.projectName || "-"}</strong>
                  </div>
                  <div>
                    <span>产品</span>
                    <strong>{analysisReport.projectDetection?.productName || "-"}</strong>
                  </div>
                  <div>
                    <span>项目类型</span>
                    <strong>{analysisReport.projectDetection?.projectCategory || "-"}</strong>
                  </div>
                  <div>
                    <span>分析时间</span>
                    <strong>{analysisReport.analyzedAt ? new Date(analysisReport.analyzedAt).toLocaleString("zh-CN") : "-"}</strong>
                  </div>
                </div>
                <section className="deliverable-section">
                  <h4>理解摘要</h4>
                  <p>{analysisReport.understanding || selectedDrawerArtifact.summary || "-"}</p>
                </section>
                <section className="deliverable-section">
                  <h4>高优先级发现</h4>
                  {analysisReport.prioritizedFindings?.length ? (
                    <ul className="history-list">
                      {analysisReport.prioritizedFindings.slice(0, 6).map((item, index) => (
                        <li key={`${item.priority}-${index}`} className="history-item">
                          <strong>[{item.priority}] {item.content}</strong>
                          <p className="hint">原因：{item.reason || "-"}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">暂无结构化发现。</p>
                  )}
                </section>
                <section className="deliverable-section">
                  <h4>下一步建议</h4>
                  {analysisReport.nextActions?.length ? (
                    <ul className="history-list">
                      {analysisReport.nextActions.slice(0, 6).map((item, index) => (
                        <li key={`next-${index}`} className="history-item">
                          <p>{item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">暂无下一步建议。</p>
                  )}
                </section>
              </>
            ) : (
              <p className="hint">当前迭代暂无分析报告内容。</p>
            )}
          </div>
        )
      ) : null}
      {selectedArtifactKind === "product-requirements-doc" ? (
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
      ) : null}
      {selectedArtifactKind === "technical-architecture" ? (
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
      ) : null}
      {selectedArtifactKind === "code" ? (
        <ArtifactCodeViewer
          title={selectedDrawerArtifact.title}
          value={stripRichTextToPlainText(artifactDraftContent || selectedDrawerArtifact.summary || "暂无代码内容")}
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
                  <p>expected：{item.expected || "-"}</p>
                  <p className="hint">状态：{item.executionStatus}</p>
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
            <p>最近结论：{currentIteration?.changeControl?.lastReleaseReviewDecision || "-"}</p>
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
      ) : null}
    </div>
  );
}
