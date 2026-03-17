import { useRef, useState, type ChangeEvent, type RefObject } from "react";
import type {
  ChatSendStatus,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationStateMachinePayload,
  IterationStatus,
} from "../../domain/workspace/types";
import type { UploadAnalysisProgress } from "../../domain/workspace/analysisTypes";
import {
  buildIterationChatDisplayItems,
  compactArtifactCardSummary,
  parseArtifactReferenceMessage,
  shouldSuppressArtifactTextMessage
} from "../../app/workspaceChatMessagePresentation";

function resolveIterationMessageTheme(msg: { role: string }, hasDeliverable: boolean) {
  if (hasDeliverable) return "theme-deliverable";
  if (msg.role === "assistant") return "theme-assistant";
  return "";
}
import { buildAnalysisArtifactPreview } from "./analysisArtifactPresenter";
import type { ArtifactPreviewKind } from "./iterationWorkspacePanelTypes";
import { resolveArtifactPreviewKind } from "./iterationWorkspacePanelUtils";

type ArtifactItem = {
  id: string;
  title: string;
  summary?: string;
  evidence?: string[];
  source?: string;
  stage?: string;
  draft?: { content?: string };
  outputVersion: number;
  gateStatus?: string;
  editCapability?: string;
  lastConfirmedAt?: string;
  lastConfirmedBy?: string;
  updatedAt?: string;
};

export type IterationChatPanelProps = {
  currentIteration: Iteration | null;
  error: string | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatSendStatus: ChatSendStatus;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  isAnalyzingAttachment: boolean;
  lastUploadFailed: boolean;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  showInteractionPanel: boolean;
  interactionDrawerWidth: number;
  canOpenAnalysisPanel: boolean;
  showInteractionEntry: boolean;
  lastUploadMessageId: number | undefined;
  artifactItems: ArtifactItem[];
  dragOver: boolean;
  onDragOverChange: (value: boolean) => void;
  onUploadClick: () => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
  onRetryUpload: () => void | Promise<void>;
  onChatInputChange: (value: string) => void;
  onComposedSend: () => void;
  onSwitchToProjectPanel: () => void;
  onTransitionState: (toStatus: IterationStatus) => void;
  onOpenAnalysisDrawer: () => void;
  onOpenInteractionPanel: () => void;
  onOpenArtifactPreviewByTitle: (title: string) => void;
  showUploadMenu: boolean;
  onToggleUploadMenu: () => void;
  onCloseUploadMenu: () => void;
  uploadTriggerRef: RefObject<HTMLDivElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  folderPickerAttrs: Record<string, string>;
  chatComposerInputRef: RefObject<HTMLInputElement>;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onFolderUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function IterationChatPanel({
  currentIteration,
  error,
  contextData,
  stateMachine,
  chatMessages,
  chatSendStatus,
  chatInput,
  fileInputRef,
  isAnalyzingAttachment,
  lastUploadFailed,
  uploadAnalysisProgress,
  showInteractionPanel,
  interactionDrawerWidth,
  canOpenAnalysisPanel,
  showInteractionEntry,
  lastUploadMessageId,
  artifactItems,
  dragOver,
  onDragOverChange,
  onUploadClick,
  onUploadFiles,
  onRetryUpload,
  onChatInputChange,
  onComposedSend,
  onSwitchToProjectPanel,
  onTransitionState,
  onOpenAnalysisDrawer,
  onOpenInteractionPanel,
  onOpenArtifactPreviewByTitle,
  showUploadMenu,
  onToggleUploadMenu,
  onCloseUploadMenu,
  uploadTriggerRef,
  folderInputRef,
  folderPickerAttrs,
  chatComposerInputRef,
  onUpload,
  onFolderUpload,
}: IterationChatPanelProps) {
  const scopeInCount = contextData?.scope.inScope.length ?? 0;
  const scopeOutCount = contextData?.scope.outOfScope.length ?? 0;
  const acceptanceCount = contextData?.scope.acceptanceCriteria.length ?? 0;
  const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "BuildWise AI" : "系统");
  const getRoleAvatar = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "AI" : "系");
  const getMsgKind = (msg: IterationMessage) => {
    if (msg.role === "system" && (msg.content.startsWith("已上传附件") || msg.content.startsWith("已上传文件夹"))) {
      return "event-upload";
    }
    if (
      msg.role === "assistant" &&
      (msg.content.includes("附件已完成大模型分析") || msg.content.includes("查看分析报告"))
    ) {
      return "event-analysis";
    }
    return "";
  };
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const displayMessages = buildIterationChatDisplayItems(chatMessages);

  const statusLabelMap: Record<IterationStatus, string> = {
    planned: "规划中",
    "in-progress": "进行中",
    review: "评审中",
    blocked: "阻塞中",
    completed: "已完成"
  };
  const renderStatusLabel = (status: IterationStatus) => statusLabelMap[status] ?? status;
  const allowedTransitions = stateMachine?.allowedTransitions ?? [];
  const hasStateMachineActions = allowedTransitions.length > 0;

  const resolveGuidanceText = (content: string) => {
    if (content.startsWith("操作建议JSON:")) {
      const raw = content.replace(/^操作建议JSON:/, "").trim();
      try {
        const parsed = JSON.parse(raw) as {
          uploadRecommended?: boolean;
          actions?: string[];
          checklist?: string[];
          prerequisites?: string[];
        };
        const parts: string[] = [];
        if (parsed.uploadRecommended) {
          parts.push("建议先上传本轮相关材料。");
        }
        const actions = Array.isArray(parsed.actions)
          ? parsed.actions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 3)
          : [];
        if (actions.length > 0) {
          parts.push(`下一步可执行：${actions.join("；")}。`);
        }
        const checklist = Array.isArray(parsed.checklist)
          ? parsed.checklist.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 2)
          : [];
        if (checklist.length > 0) {
          parts.push(`优先确认：${checklist.join("；")}。`);
        }
        const prerequisites = Array.isArray(parsed.prerequisites)
          ? parsed.prerequisites.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 2)
          : [];
        if (prerequisites.length > 0) {
          parts.push(`前置条件：${prerequisites.join("；")}。`);
        }
        return parts.length > 0 ? `继续推进建议：${parts.join("")}` : "继续推进建议：请在当前会话中明确下一步目标与边界。";
      } catch {
        return "继续推进建议：请在当前会话中明确下一步目标与边界。";
      }
    }
    if (content.startsWith("操作建议：")) {
      const items = content
        .replace(/^操作建议：/, "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);
      return items.length > 0 ? `补充建议：${items.join("；")}。` : "补充建议：请继续在会话中确认下一步。";
    }
    return "";
  };

  const resolveDeliverableCardData = (content: string) => {
    const deliverable = parseArtifactReferenceMessage(content);
    if (!deliverable) {
      return null;
    }
    const matchedArtifact = artifactItems.find((item) => item.title === deliverable.title);
    if (!matchedArtifact) {
      return deliverable;
    }
    const matchedKind = resolveArtifactPreviewKind(matchedArtifact.id);
    if (matchedKind !== "analysis-report") {
      return {
        ...deliverable,
        summary: compactArtifactCardSummary(matchedArtifact.summary || deliverable.summary, deliverable.summary),
        evidence: deliverable.evidence.length > 0 ? deliverable.evidence : matchedArtifact.evidence || []
      };
    }
    const preview = buildAnalysisArtifactPreview(matchedArtifact.draft?.content || "");
    return {
      ...deliverable,
      summary: compactArtifactCardSummary(preview.summary || matchedArtifact.summary || deliverable.summary, deliverable.summary),
      evidence: preview.evidence.length > 0 ? preview.evidence : deliverable.evidence
    };
  };

  return (
    <article
      className={`panel chat-panel ${showInteractionPanel ? "interaction-companion-open" : ""}`}
      style={{ "--interaction-drawer-offset": `min(${interactionDrawerWidth}px, 100vw)` } as React.CSSProperties}
    >
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
      {error ? (
        <div className="inline-error-banner" role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}
      <div className="iteration-status-strip">
        <span className={`status-pill ${stateMachine?.currentStatus || currentIteration?.status || "planned"}`}>
          {renderStatusLabel(stateMachine?.currentStatus || currentIteration?.status || "planned")}
        </span>
        <span>继承：{contextData?.previous ? contextData.previous.name : "首个版本"}</span>
        <span>范围 in/out：{scopeInCount}/{scopeOutCount}</span>
        <span>验收：{acceptanceCount} 项</span>
        {hasStateMachineActions ? (
          <div className="chat-tools">
            {allowedTransitions.slice(0, 2).map((status) => (
              <button key={status} type="button" className="btn ghost mini" onClick={() => onTransitionState(status)}>
                流转到 {renderStatusLabel(status)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="iteration-workbench-grid">
        <div className="iteration-chat-main">
          <div
            className={`chat-body ${dragOver ? "drop-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              onDragOverChange(true);
            }}
            onDragLeave={() => onDragOverChange(false)}
            onDrop={(event) => {
              event.preventDefault();
              onDragOverChange(false);
              const files = Array.from(event.dataTransfer.files || []);
              if (files.length > 0) {
                void onUploadFiles(files);
              }
            }}
          >
            {chatMessages.length === 0 ? (
              <div className="empty-state">暂无消息，输入需求后开始沟通。</div>
            ) : (
              displayMessages.map((item) => {
                const msg = item.leadMessage;
                const cardMessage = item.cardMessage;
                const deliverable = cardMessage ? resolveDeliverableCardData(cardMessage.content) : null;
                const msgTheme = resolveIterationMessageTheme(msg, Boolean(deliverable));
                const textMessage = item.textMessage;
                const resolvedCardSummary = deliverable ? compactArtifactCardSummary(deliverable.summary || "") : "";
                const rawTextContent = textMessage ? resolveGuidanceText(textMessage.content) || textMessage.content : "";
                const shouldHideTextContent =
                  Boolean(textMessage && deliverable && shouldSuppressArtifactTextMessage(rawTextContent, resolvedCardSummary, deliverable.title));
                const textContent = shouldHideTextContent ? "" : rawTextContent;
                return (
                <div key={item.key} className={`msg-row msg-row-${msg.role}`}>
                  {msg.role !== "user" ? (
                    <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                      {getRoleAvatar(msg.role)}
                    </div>
                  ) : null}
                  <div className={`msg msg-${msg.role} ${getMsgKind(msg)} ${msgTheme}`.trim()}>
                    <div className="msg-meta">
                      <span>{getRoleLabel(msg.role)}</span>
                      <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                    </div>
                    {textMessage && textContent ? <p className={cardMessage ? "msg-mixed-copy" : undefined}>{textContent}</p> : null}
                    {deliverable ? (
                      <div className="deliverable-msg-card">
                        <div className="deliverable-msg-head">
                          <strong>{deliverable.title}</strong>
                          <span className="hint">待你确认</span>
                        </div>
                        {resolvedCardSummary ? <p>{resolvedCardSummary}</p> : null}
                        {deliverable.evidence.length > 0 ? (
                          <ul className="deliverable-plain-list">
                            {deliverable.evidence.map((entry) => (
                              <li key={entry}>{entry}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="msg-inline-actions">
                          <button type="button" className="btn ghost mini" onClick={() => onOpenArtifactPreviewByTitle(deliverable.title)}>
                            查看交付物
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {!textMessage && !deliverable ? <p>{resolveGuidanceText(msg.content) || msg.content}</p> : null}
                    {getMsgKind(msg) === "event-upload" && msg.id === lastUploadMessageId ? (
                      <div className="msg-inline-actions">
                        {canOpenAnalysisPanel ? (
                          <button type="button" className="btn ghost mini attachment-report-entry" onClick={onOpenAnalysisDrawer}>
                            查看分析报告
                          </button>
                        ) : null}
                        {showInteractionEntry ? (
                          <button type="button" className="btn ghost mini" onClick={onOpenInteractionPanel}>
                            交互界面
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {msg.role === "user" ? (
                    <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                      {getRoleAvatar(msg.role)}
                    </div>
                  ) : null}
                </div>
              )})
            )}
          </div>
          {uploadAnalysisProgress ? (
            <div className={`upload-analysis-status stage-${uploadAnalysisProgress.stage}`} role="status" aria-live="polite">
              <div className="upload-analysis-status-head">
                <strong>{uploadAnalysisProgress.label}</strong>
                <span>{Math.max(0, Math.min(100, uploadAnalysisProgress.percent))}%</span>
              </div>
              <p>{uploadAnalysisProgress.detail}</p>
              <div className="progress-bar">
                <div className="progress-value" style={{ width: `${Math.max(0, Math.min(100, uploadAnalysisProgress.percent))}%` }} />
              </div>
            </div>
          ) : null}
          {lastUploadFailed ? (
            <div className="chat-tools upload-tip">
              <button type="button" className="btn ghost mini" onClick={() => void onRetryUpload()}>
                重新尝试上传
              </button>
            </div>
          ) : null}
          <div className="chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden-input"
              onChange={onUpload}
              multiple
            />
            <input
              ref={folderInputRef}
              type="file"
              className="hidden-input"
              multiple
              {...folderPickerAttrs}
              onChange={onFolderUpload}
            />
            <div className="upload-trigger" ref={uploadTriggerRef}>
              <button
                type="button"
                className="icon-btn upload-icon-btn"
                onClick={onToggleUploadMenu}
                disabled={!currentIteration || isAnalyzingAttachment}
                aria-label={isAnalyzingAttachment ? "附件分析中" : "发送附件"}
                title={isAnalyzingAttachment ? "分析中..." : "发送附件/文件夹（支持拖拽）"}
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
              {showUploadMenu ? (
                <div className="upload-menu" role="menu">
                  <button
                    type="button"
                    className="btn ghost mini"
                    onClick={() => {
                      onCloseUploadMenu();
                      onUploadClick();
                    }}
                  >
                    选择文件
                  </button>
                  <button
                    type="button"
                    className="btn ghost mini"
                    onClick={() => {
                      onCloseUploadMenu();
                      folderInputRef.current?.click();
                    }}
                  >
                    选择文件夹
                  </button>
                </div>
              ) : null}
            </div>
            <input
              ref={chatComposerInputRef}
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onComposedSend();
                }
              }}
              onFocus={onCloseUploadMenu}
              placeholder="输入需求或指令，例如：完成: 接口联调"
              aria-label="需求输入框"
            />
            <button type="button" className="btn primary" onClick={onComposedSend} disabled={!chatInput.trim()}>
              发送
            </button>
          </div>
          {chatSendStatus === "sending" || chatSendStatus === "failed" ? (
            <p className={`chat-send-status status-${chatSendStatus}`}>
              {chatSendStatus === "sending" ? "发送中..." : "发送失败，请重试"}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
