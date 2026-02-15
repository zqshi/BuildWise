import type { ChangeEvent, RefObject } from "react";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationContextPayload,
  IterationMessage,
} from "../../domain/workspace/types";

type IterationWorkspacePanelProps = {
  currentIteration: Iteration | null;
  contextData: IterationContextPayload | null;
  chatMessages: IterationMessage[];
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  uploadedFile: { name: string; iterationId: number } | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatInputChange: (value: string) => void;
  onChatSend: () => void;
  onSwitchToProjectPanel: () => void;
};

export function IterationWorkspacePanel({
  currentIteration,
  contextData,
  chatMessages,
  chatInput,
  fileInputRef,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onUpload,
  onChatInputChange,
  onChatSend,
  onSwitchToProjectPanel
}: IterationWorkspacePanelProps) {
  const scopeInCount = contextData?.scope.inScope.length ?? 0;
  const scopeOutCount = contextData?.scope.outOfScope.length ?? 0;
  const acceptanceCount = contextData?.scope.acceptanceCriteria.length ?? 0;
  const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "BuildWise AI" : "系统");
  const getMsgKind = (msg: IterationMessage) => {
    if (msg.role === "system" && msg.content.startsWith("已上传附件")) {
      return "event-upload";
    }
    if (msg.role === "assistant" && msg.content.includes("附件已完成大模型分析")) {
      return "event-analysis";
    }
    return "";
  };
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      <article className="panel chat-panel">
        <div className="panel-head">
          <div className="panel-title-wrap">
            <button type="button" className="icon-btn" onClick={onSwitchToProjectPanel} aria-label="返回项目管理">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2>迭代内需求沟通</h2>
            <p className="hint">
              {currentIteration ? `当前迭代：${currentIteration.name}` : "请先在右侧选择迭代版本"}
            </p>
          </div>
        </div>

        {uploadedFile && currentIteration && uploadedFile.iterationId === currentIteration.id ? (
          <div className="info-box attachment-card">
            <p>当前附件：{uploadedFile.name}</p>
            {isAnalyzingAttachment ? <p className="hint">系统正在分析附件内容，请稍候。</p> : null}
          </div>
        ) : null}

        <div className="iteration-meta-grid">
          <div className="info-box">
            <p className="hint">继承来源</p>
            <p>{contextData?.previous ? contextData.previous.name : "无（首个版本）"}</p>
          </div>
          <div className="info-box">
            <p className="hint">范围项</p>
            <p>in: {scopeInCount} / out: {scopeOutCount}</p>
          </div>
          <div className="info-box">
            <p className="hint">验收标准</p>
            <p>{acceptanceCount} 项</p>
          </div>
        </div>
        <div className="chat-body">
          {chatMessages.length === 0 ? (
            <div className="empty-state">暂无消息，输入需求后开始沟通。</div>
          ) : (
            chatMessages.map((msg) => (
              <div key={`${msg.id}-${msg.createdAt}`} className={`msg msg-${msg.role} ${getMsgKind(msg)}`}>
                <div className="msg-meta">
                  <span>{getRoleLabel(msg.role)}</span>
                  <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                </div>
                <p>{msg.content}</p>
                {getMsgKind(msg) === "event-analysis" && analysisReport && !isAnalyzingAttachment ? (
                  <div className="msg-inline-actions">
                    <button type="button" className="btn ghost mini attachment-report-entry" onClick={onOpenAnalysisPanel}>
                      查看分析报告
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="chat-input-row">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden-input"
            onChange={onUpload}
            accept=".fig,.sketch,.xd,.psd,.pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.md,.json"
          />
          <button
            type="button"
            className="icon-btn upload-icon-btn"
            onClick={onUploadClick}
            disabled={!currentIteration || isAnalyzingAttachment}
            aria-label={isAnalyzingAttachment ? "附件分析中" : "上传附件"}
            title={isAnalyzingAttachment ? "分析中..." : "上传附件"}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6.2 8.6L3.9 10.9C3 11.8 3 13.2 3.9 14.1C4.8 15 6.2 15 7.1 14.1L11.9 9.3C13.1 8.1 13.1 6.2 11.9 5C10.7 3.8 8.8 3.8 7.6 5L2.8 9.8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onChatSend();
              }
            }}
            placeholder="输入需求或指令，例如：完成: 接口联调"
            aria-label="需求输入框"
          />
          <button type="button" className="btn primary" onClick={onChatSend} disabled={!chatInput.trim()}>
            发送
          </button>
        </div>
      </article>

      <div className={`analysis-drawer-mask ${showAnalysisPanel ? "open" : ""}`} onClick={onCloseAnalysisPanel} aria-hidden={!showAnalysisPanel} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showAnalysisPanel ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>分析报告</h2>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={onCloseAnalysisPanel}>
                收起报告
              </button>
              <button type="button" className="btn ghost mini" onClick={onSwitchToProjectPanel}>
                返回项目
              </button>
            </div>
          </div>
          <div className="preview-scroll">
            {!analysisReport ? (
              <div className="info-box">
                <p className="hint">暂无分析结果，请先上传附件。</p>
              </div>
            ) : (
              <>
                <div className="info-box">
                  <h3>理解结论</h3>
                  <p>{analysisReport.understanding}</p>
                  <p>附件：{analysisReport.fileName}</p>
                  <p>分析时间：{new Date(analysisReport.analyzedAt).toLocaleString("zh-CN")}</p>
                </div>
                <div className="info-box">
                  <h3>版本差异</h3>
                  <p>基线版本：{analysisReport.versionDiff.baselineIterationName}</p>
                  <p>新增：{analysisReport.versionDiff.added.join("、") || "无"}</p>
                  <p>变化：{analysisReport.versionDiff.changed.join("、") || "无"}</p>
                  <p>移除：{analysisReport.versionDiff.removed.join("、") || "无"}</p>
                </div>
                <div className="info-box">
                  <h3>风险提示</h3>
                  <p>{analysisReport.risks.join("；")}</p>
                </div>
                <div className="info-box">
                  <h3>建议动作</h3>
                  <p>{analysisReport.suggestions.join("；")}</p>
                </div>
              </>
            )}
          </div>
        </article>
      </aside>

    </>
  );
}
