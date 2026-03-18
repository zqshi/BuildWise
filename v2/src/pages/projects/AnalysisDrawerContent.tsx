import { memo, type RefObject } from "react";
import { deleteOpsTriageTemplate, upsertOpsTriageTemplate } from "../../app/workspaceApi";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import { ArtifactCodeViewer, ArtifactTextEditor } from "./ArtifactEditorWidgets";
import {
  stripRichTextToPlainText
} from "./artifactEditorModel";
import { ArtifactImpactPanel } from "./IterationChangeIntelligencePanel";
import type {
  ArtifactPreviewKind,
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
} from "./iterationWorkspacePanelTypes";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationVisualEditResponse,
} from "./iterationWorkspacePanelTypes";
import type { OpsTriageTemplate } from "./iterationWorkspacePanelTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import { parseLines, copyText } from "./messageDisplayHelpers";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";

/* ────────────────────────────────────────────────────────── */

export type AnalysisDrawerContentProps = {
  /* ── core data ── */
  analysisReport: AttachmentAnalysisReport | null;
  currentIteration: Iteration | null;
  selectedDrawerArtifact: IterationArtifactWorkflowItem | null;
  selectedArtifactKind: ArtifactPreviewKind | null;

  /* ── artifact editor state ── */
  artifactEditorValue: string;
  artifactEditorDirty: boolean;
  artifactEditorBusy: boolean;
  artifactEditorMode: "view" | "edit";
  artifactEditorSource: string;
  isEditableTextArtifact: boolean;
  canEditSelectedTextArtifact: boolean;
  selectedArtifactAwaitingConfirmation: boolean;

  /* ── artifact draft / preview ── */
  analysisDraftSections: AnalysisArtifactSection[];
  artifactDraftContent: string;
  selectedArtifactHtmlPreview: string;
  selectedArtifactHtmlContent: string;

  /* ── html interaction ── */
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  interactionEditMode: boolean;
  htmlPreviewHistory: HtmlPreviewHistoryItem[];
  interactionInstruction: string;

  /* ── test matrix ── */
  generatedTestMatrix: IterationGeneratedTestCase[];
  testMatrixStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">;
  testMatrixNoteMap: Record<string, string>;
  matrixSummary: {
    total: number;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    coverage: number;
    passRate: number;
  };

  /* ── prioritised findings ── */
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;

  /* ── risk / suggestions ── */
  materialRisks: string[];
  materialSuggestions: string[];

  /* ── report-level flags / derived ── */
  showAdvancedReportSections: boolean;
  hasBaselineComparison: boolean;

  /* ── advanced report sections ── */
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  opsTriage: AttachmentAnalysisReport["opsTriage"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;

  /* ── diff data ── */
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  diffAdded: string[];
  diffChanged: string[];
  diffRemoved: string[];

  /* ── confirmation ── */
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;

  /* ── clarification ── */
  clarificationQuestions: string[];

  /* ── change control / notices ── */
  changeControlBusy: boolean;
  changeControlNotice: string;
  opsCopyNotice: string;

  /* ── ops template form ── */
  templateBusy: boolean;
  templateNotice: string;
  templateCategory: string;
  templateKeywordsText: string;
  templateCommandsText: string;
  templateNote: string;

  /* ── ops templates data ── */
  opsTemplates: OpsTriageTemplate[];

  /* ── image previews (used for hint) ── */
  imagePrototypePreviews: UploadedAttachmentMeta["imagePreviews"];

  /* ── layout ── */
  artifactDrawerWidth: number;

  /* ── refs ── */
  analysisScrollRef: RefObject<HTMLDivElement>;
  artifactHtmlPreviewFrameRef: RefObject<HTMLIFrameElement>;

  /* ── callbacks: panel actions ── */
  onCloseAnalysisPanel: () => void;
  onChatInputChange: (value: string) => void;
  onChatSend: (options?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }) => Promise<IterationVisualEditResponse | null>;

  /* ── callbacks: artifact actions ── */
  handleSaveArtifactEditor: () => Promise<void>;
  handleSubmitArtifactForReview: () => Promise<void>;
  handleConfirmSelectedArtifact: () => Promise<void>;
  handleRequestArtifactRevision: () => void;

  /* ── callbacks: test matrix ── */
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => void | Promise<void>;
  onGenerateTestArtifacts: (dryRun?: boolean) => void | Promise<void>;
  onRefreshReleaseReview: () => void | Promise<void>;

  /* ── callbacks: setters ── */
  setArtifactEditorValue: React.Dispatch<React.SetStateAction<string>>;
  setArtifactEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setArtifactEditorMode: React.Dispatch<React.SetStateAction<"view" | "edit">>;
  setArtifactEditorBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
  setOpsCopyNotice: React.Dispatch<React.SetStateAction<string>>;
  setTestMatrixStatusMap: React.Dispatch<React.SetStateAction<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>>;
  setTestMatrixNoteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  setTemplateKeywordsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCommandsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateNote: React.Dispatch<React.SetStateAction<string>>;
  setInteractionEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInteractionInstruction: React.Dispatch<React.SetStateAction<string>>;
  setSelectedHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  setHoveredHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  setHtmlPreviewHistory: React.Dispatch<React.SetStateAction<HtmlPreviewHistoryItem[]>>;

  /* ── callbacks: drawer resize ── */
  handleArtifactDrawerResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;

  /* ── callbacks: html preview ── */
  handleUndoHtmlPreview: () => void;
  sendInteractionInstruction: (instruction: string) => Promise<void> | void;

  /* ── callbacks: interaction panel ── */
  openInteractionPanel: () => void;

  /* ── callbacks: ops templates ── */
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

export const AnalysisDrawerContent = memo(function AnalysisDrawerContent(props: AnalysisDrawerContentProps) {
  const {
    analysisReport,
    currentIteration,
    selectedDrawerArtifact,
    selectedArtifactKind,
    artifactEditorValue,
    artifactEditorDirty,
    artifactEditorBusy,
    artifactEditorMode,
    artifactEditorSource,
    isEditableTextArtifact,
    canEditSelectedTextArtifact,
    selectedArtifactAwaitingConfirmation,
    analysisDraftSections,
    artifactDraftContent,
    selectedArtifactHtmlPreview,
    selectedArtifactHtmlContent,
    selectedHtmlPreview,
    selectedHtmlElement,
    interactionEditMode,
    htmlPreviewHistory,
    interactionInstruction,
    generatedTestMatrix,
    testMatrixStatusMap,
    testMatrixNoteMap,
    matrixSummary,
    onlyHighValue,
    visiblePrioritizedFindings,
    materialRisks,
    materialSuggestions,
    showAdvancedReportSections,
    hasBaselineComparison,
    traceabilityMap,
    executableConstraints,
    versionDiffDetailed,
    releaseReview,
    domainKnowledge,
    opsTriage,
    qualityArtifacts,
    diffLocations,
    diffAdded,
    diffChanged,
    diffRemoved,
    reportPendingConfirmation,
    reportConfirmedAt,
    confirmedUnderstanding,
    changeControlBusy,
    opsCopyNotice,
    templateBusy,
    templateNotice,
    templateCategory,
    templateKeywordsText,
    templateCommandsText,
    templateNote,
    opsTemplates,
    imagePrototypePreviews,
    artifactDrawerWidth,
    analysisScrollRef,
    artifactHtmlPreviewFrameRef,
    onCloseAnalysisPanel,
    onChatInputChange,
    onChatSend,
    handleSaveArtifactEditor,
    handleSubmitArtifactForReview,
    handleConfirmSelectedArtifact,
    handleRequestArtifactRevision,
    onUpdateTestMatrixExecution,
    onGenerateTestArtifacts,
    onRefreshReleaseReview,
    setArtifactEditorValue,
    setArtifactEditorDirty,
    setArtifactEditorMode,
    setChangeControlBusy,
    setChangeControlNotice,
    setOpsCopyNotice,
    setTestMatrixStatusMap,
    setTestMatrixNoteMap,
    setOnlyHighValue,
    setTemplateBusy,
    setTemplateNotice,
    setTemplateCategory,
    setTemplateKeywordsText,
    setTemplateCommandsText,
    setTemplateNote,
    setInteractionEditMode,
    setInteractionInstruction,
    handleArtifactDrawerResizePointerDown,
    handleUndoHtmlPreview,
    sendInteractionInstruction,
    openInteractionPanel,
    reloadOpsTemplates,
    buildOpsCommandTemplates,
  } = props;

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
    <>
      <div className="analysis-drawer-mask open" onClick={onCloseAnalysisPanel} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") onCloseAnalysisPanel(); }} aria-label="关闭" aria-hidden={false} />
      <aside
        className="panel preview-panel context-panel artifact-preview-panel analysis-drawer open"
        style={{ width: `min(${artifactDrawerWidth}px, 100vw)` }}
      >
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="artifact-drawer-resize-handle"
            aria-label="拖拽调整交付物抽屉宽度"
            title="拖拽调整交付物抽屉宽度"
            onPointerDown={handleArtifactDrawerResizePointerDown}
          />
          <div className="panel-head analysis-drawer-head">
            <div>
              <h2>{selectedDrawerArtifact ? `${selectedDrawerArtifact.title}` : "分析报告抽屉"}</h2>
            </div>
            <div className="chat-tools">
              <button type="button" className="visual-align-hidden-trigger" onClick={openInteractionPanel}>
                交互界面
              </button>
              <button type="button" className="icon-btn" aria-label="关闭报告抽屉" onClick={onCloseAnalysisPanel}>
                ✕
              </button>
            </div>
          </div>
          <div
            ref={analysisScrollRef}
            className="preview-scroll"
          >
            {selectedDrawerArtifact ? (
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
                          sandbox="allow-scripts allow-same-origin"
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
                <ArtifactImpactPanel iteration={currentIteration} artifact={selectedDrawerArtifact} />
                <footer className="artifact-review-footer">
                  <p>
                    当前版本：v{selectedDrawerArtifact.outputVersion || 0} · 状态：
                    {selectedDrawerArtifact.gateStatus === "passed"
                      ? " 已确认"
                      : selectedDrawerArtifact.outputVersion > 0
                        ? " 待你确认"
                        : " 尚未提交确认"}
                  </p>
                  {selectedDrawerArtifact.lastConfirmedAt ? (
                    <p className="hint">
                      最近确认：{selectedDrawerArtifact.lastConfirmedBy || "-"} ·{" "}
                      {new Date(selectedDrawerArtifact.lastConfirmedAt).toLocaleString("zh-CN")}
                    </p>
                  ) : (
                    <p className="hint">当前交付物还没有用户确认记录。</p>
                  )}
                  <div className="chat-tools">
                    <button
                      type="button"
                      className="btn primary mini"
                      onClick={() => void handleConfirmSelectedArtifact()}
                      disabled={!selectedArtifactAwaitingConfirmation || artifactEditorBusy}
                    >
                      确认通过
                    </button>
                    <button type="button" className="btn ghost mini" onClick={handleRequestArtifactRevision}>
                      去对话中提调整
                    </button>
                  </div>
                </footer>
              </div>
            ) : null}
            {!selectedDrawerArtifact ? (
              !analysisReport ? (
              <div className="analysis-fallback-shell">
                <section className="analysis-fallback-section">
                  <h3>对话推进模式</h3>
                  <div className="info-box">
                    <p>当前暂无结构化分析报告。请直接在聊天窗口继续描述目标、边界或阻断点，OpenClaw 会按对话上下文逐轮推进。</p>
                    <p className="hint">建议先上传最新需求/原型/代码变更材料，再继续对话以获得更准确推进结果。</p>
                  </div>
                </section>
              </div>
              ) : (
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
                {showAdvancedReportSections && generatedTestMatrix.length > 0 ? (
                  <div className="info-box">
                    <h3>测试矩阵执行</h3>
                    <p>
                      总数 {matrixSummary.total}，已执行 {matrixSummary.executed}，通过 {matrixSummary.passed}，失败 {matrixSummary.failed}，阻断 {matrixSummary.blocked}，
                      覆盖率 {matrixSummary.coverage}% ，通过率 {matrixSummary.passRate}%
                    </p>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={() =>
                          setTestMatrixStatusMap(
                            Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "passed"])) as Record<
                              string,
                              "pending" | "passed" | "failed" | "blocked" | "skipped"
                            >
                          )
                        }
                      >
                        全部标记为 passed
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={() =>
                          setTestMatrixStatusMap(
                            Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "pending"])) as Record<
                              string,
                              "pending" | "passed" | "failed" | "blocked" | "skipped"
                            >
                          )
                        }
                      >
                        全部重置为 pending
                      </button>
                    </div>
                    <ul className="history-list">
                      {generatedTestMatrix.map((item) => (
                        <li key={item.caseId} className="history-item">
                          <strong>
                            [{item.type}] {item.caseId}
                          </strong>
                          <p>focus：{item.focus || "-"}</p>
                          <p>expected：{item.expected || "-"}</p>
                          <p className="hint">evidence：{item.evidence || "-"}</p>
                          <div className="chat-tools">
                            <select
                              value={testMatrixStatusMap[item.caseId] || "pending"}
                              onChange={(event) => {
                                const next = event.target.value as "pending" | "passed" | "failed" | "blocked" | "skipped";
                                setTestMatrixStatusMap((prev) => ({ ...prev, [item.caseId]: next }));
                              }}
                            >
                              <option value="pending">pending</option>
                              <option value="passed">passed</option>
                              <option value="failed">failed</option>
                              <option value="blocked">blocked</option>
                              <option value="skipped">skipped</option>
                            </select>
                          </div>
                          <label className="hint">
                            执行备注
                            <textarea
                              rows={2}
                              value={testMatrixNoteMap[item.caseId] || ""}
                              onChange={(event) =>
                                setTestMatrixNoteMap((prev) => ({
                                  ...prev,
                                  [item.caseId]: event.target.value
                                }))
                              }
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          const updates = generatedTestMatrix
                            .map((item) => {
                              const status = testMatrixStatusMap[item.caseId] || item.executionStatus;
                              const note = (testMatrixNoteMap[item.caseId] || "").trim();
                              const changed = status !== item.executionStatus || note !== (item.executionNote || "");
                              return changed
                                ? {
                                    caseId: item.caseId,
                                    status,
                                    note
                                  }
                                : null;
                            })
                            .filter(Boolean) as Array<{
                            caseId: string;
                            status: "pending" | "passed" | "failed" | "blocked" | "skipped";
                            note?: string;
                          }>;
                          if (updates.length === 0) {
                            return;
                          }
                          setChangeControlBusy(true);
                          try {
                            await onUpdateTestMatrixExecution(updates);
                            setChangeControlNotice(`已保存 ${updates.length} 条测试执行状态。`);
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        保存测试执行状态
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          setChangeControlBusy(true);
                          try {
                            await onGenerateTestArtifacts(true);
                            setChangeControlNotice("已生成测试产物计划（dry-run）。");
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        生成测试产物（Dry Run）
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          setChangeControlBusy(true);
                          try {
                            await onRefreshReleaseReview();
                            setChangeControlNotice("已刷新发布前质量评审。");
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        刷新发布评审
                      </button>
                    </div>
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
                {showAdvancedReportSections && opsTriage ? (
                  <div className="info-box">
                    <h3>运维辅助建议</h3>
                    {(opsTriage.hypotheses?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {opsTriage.hypotheses.slice(0, 4).map((item, index) => (
                          <li key={`${item.priority}-${item.item}-${index}`} className="history-item">
                            <strong>{item.priority}</strong>
                            <p>{item.item}</p>
                            <p className="hint">evidence：{item.evidence || "-"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {(opsTriage.triageSteps?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {opsTriage.triageSteps.slice(0, 4).map((item, index) => {
                          const commands = buildOpsCommandTemplates(item.step, currentIteration?.projectId ?? 1, opsTemplates);
                          return (
                            <li key={`${item.step}-${index}`} className="history-item">
                              <strong>步骤 {index + 1}</strong>
                              <p>{item.step}</p>
                              <p className="hint">期望信号：{item.expectedSignal || "-"}</p>
                              <p className="hint">失败回退：{item.fallback || "-"}</p>
                              <p className="hint">建议命令：{commands.join("  |  ")}</p>
                              <div className="chat-tools">
                                <button
                                  type="button"
                                  className="btn ghost mini"
                                  onClick={async () => {
                                    const payload = [
                                      `排障步骤：${item.step}`,
                                      `期望信号：${item.expectedSignal || "-"}`,
                                      `失败回退：${item.fallback || "-"}`,
                                      "建议命令：",
                                      ...commands
                                    ].join("\n");
                                    await copyText(payload);
                                    setOpsCopyNotice(`已复制步骤 ${index + 1} 的排障内容。`);
                                  }}
                                >
                                  复制该步骤
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    <div className="info-box">
                      <h3>排障模板配置（项目级）</h3>
                      {templateNotice ? <p className="hint">{templateNotice}</p> : null}
                      <label className="hint">
                        类别
                        <input value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} placeholder="如：db/network/cache" />
                      </label>
                      <label className="hint">
                        关键词（每行一项）
                        <textarea
                          rows={3}
                          value={templateKeywordsText}
                          onChange={(event) => setTemplateKeywordsText(event.target.value)}
                          placeholder={"例如：\n数据库\ndb\n连接超时"}
                        />
                      </label>
                      <label className="hint">
                        命令模板（每行一条，支持 {"{{projectId}}/{{apiBase}}/{{backendDir}}"}）
                        <textarea
                          rows={4}
                          value={templateCommandsText}
                          onChange={(event) => setTemplateCommandsText(event.target.value)}
                          placeholder={"例如：\ncurl -sS {{apiBase}}/api/ops/runtime\ncd {{backendDir}} && PROJECT_ID={{projectId}} npm run ops:rollback"}
                        />
                      </label>
                      <label className="hint">
                        说明
                        <input value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} placeholder="模板用途说明" />
                      </label>
                      <div className="chat-tools">
                        <button
                          type="button"
                          className="btn ghost mini"
                          disabled={templateBusy}
                          onClick={async () => {
                            const keywords = parseLines(templateKeywordsText);
                            const commands = parseLines(templateCommandsText);
                            if (keywords.length === 0 || commands.length === 0) {
                              setTemplateNotice("请至少填写 1 条关键词与 1 条命令。");
                              return;
                            }
                            setTemplateBusy(true);
                            try {
                              await upsertOpsTriageTemplate({
                                projectId: currentIteration?.projectId,
                                category: templateCategory.trim() || "custom",
                                keywords,
                                commands,
                                note: templateNote
                              });
                              await reloadOpsTemplates();
                              setTemplateNotice("模板已保存。");
                              setTemplateKeywordsText("");
                              setTemplateCommandsText("");
                              setTemplateNote("");
                            } finally {
                              setTemplateBusy(false);
                            }
                          }}
                        >
                          保存模板
                        </button>
                      </div>
                      {(opsTemplates.filter((item) => item.source === "custom").length ?? 0) > 0 ? (
                        <ul className="history-list">
                          {opsTemplates
                            .filter((item) => item.source === "custom")
                            .slice(0, 8)
                            .map((item) => (
                              <li key={item.id} className="history-item">
                                <strong>{item.category}</strong>
                                <p className="hint">关键词：{item.keywords.join("；")}</p>
                                <p className="hint">命令：{item.commands.join("  |  ")}</p>
                                <div className="chat-tools">
                                  <button
                                    type="button"
                                    className="btn ghost mini"
                                    disabled={templateBusy}
                                    onClick={async () => {
                                      setTemplateBusy(true);
                                      try {
                                        await deleteOpsTriageTemplate(item.id);
                                        await reloadOpsTemplates();
                                        setTemplateNotice("模板已删除。");
                                      } finally {
                                        setTemplateBusy(false);
                                      }
                                    }}
                                  >
                                    删除
                                  </button>
                                </div>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="hint">当前项目暂无自定义排障模板。</p>
                      )}
                    </div>
                    {opsCopyNotice ? <p className="hint">{opsCopyNotice}</p> : null}
                    <p className="hint">{opsTriage.rollbackSuggestion}</p>
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
                {hasBaselineComparison ? (
                  <>
                    <div className="info-box">
                      <h3>版本差异（对比上个版本）</h3>
                      <p>基线版本：{analysisReport.versionDiff.baselineIterationName}</p>
                      <p>新增：{diffAdded.join("、") || "无"}</p>
                      <p>变化：{diffChanged.join("、") || "无"}</p>
                      <p>移除：{diffRemoved.join("、") || "无"}</p>
                    </div>
                    <div className="info-box">
                      <h3>差异定位（与上个版本）</h3>
                      {diffLocations.length === 0 ? (
                        <p>未检测到结构化差异。</p>
                      ) : (
                        <ul className="history-list">
                          {diffLocations.map((item, index) => (
                            <li key={`${item.dimension}-${item.changeType}-${item.currentItem}-${index}`} className="history-item">
                              <strong>{item.dimension}</strong>
                              <p>
                                {item.changeType === "added" ? "新增" : item.changeType === "removed" ? "移除" : "变更"}：
                                {item.baselineItem ? `${item.baselineItem} -> ` : ""}
                                {item.currentItem}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="info-box">
                    <h3>版本差异（对比上个版本）</h3>
                    <p className="hint">当前为首个版本或无可比较基线。</p>
                  </div>
                )}
                {materialRisks.length > 0 ? (
                  <div className="info-box">
                    <h3>风险提示</h3>
                    <p>{materialRisks.join("；")}</p>
                  </div>
                ) : null}
                {materialSuggestions.length > 0 ? (
                  <div className="info-box">
                    <h3>建议动作</h3>
                    <p>{materialSuggestions.join("；")}</p>
                  </div>
                ) : null}
              </>
              )
            ) : null}
          </div>
            </article>
          </aside>
    </>
  );
});
