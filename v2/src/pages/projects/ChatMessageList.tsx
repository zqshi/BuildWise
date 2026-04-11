import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import {
  buildIterationChatDisplayItems,
  compactArtifactCardSummary,
  parseArtifactReferenceMessage,
  parseChangeImpactMessage,
  shouldSuppressArtifactTextMessage
} from "../../app/workspaceChatMessagePresentation";
import { buildAnalysisArtifactPreview } from "./analysisArtifactPresenter";
import { resolveArtifactPreviewKind } from "./iterationWorkspacePanelUtils";
import { parseUploadMeta, UploadFileCard } from "./UploadFileCard";
import type { UploadFileEntry } from "./UploadFileCard";
import type { IterationMessage } from "./iterationWorkspacePanelTypes";
import type { IterationArtifactWorkflowItem, ChatSendStatus } from "../../domain/workspace/iterationTypes";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false
  });
}

function renderAssistantMarkdown(text: string): string {
  return sanitizeHtml(md.render(text));
}

export type ChatMessageListProps = {
  chatMessages: IterationMessage[];
  artifactItems: IterationArtifactWorkflowItem[];
  canOpenAnalysisPanel: boolean;
  analysisConfirmed: boolean;
  chatSendStatus?: ChatSendStatus;
  openAnalysisDrawer: () => void;
  openArtifactPreviewByTitle: (title: string) => void;
  onPreviewFile: (file: UploadFileEntry, siblings?: UploadFileEntry[]) => void;
  onConfirmAnalysis: () => void;
};

const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "迭代教练" : "系统");
const getRoleAvatar = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "AI" : "系");

const getMsgKind = (msg: IterationMessage) => {
  if (msg.role === "system" && msg.content.startsWith("【变更影响】")) {
    return "event-impact-alert";
  }
  if (msg.content.includes("<!-- upload:") || msg.content.includes("<!-- upload-b64:") || /^已上传(附件|文档|原型|文件夹)/.test(msg.content)) {
    return "event-upload";
  }
  if (
    msg.role === "assistant" &&
    (msg.content.includes("附件已完成大模型分析") || msg.content.includes("查看分析报告") || msg.content.includes("文档分析完成"))
  ) {
    return "event-analysis";
  }
  return "";
};

const getMsgTheme = (_msg: IterationMessage) => "";

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

const resolveDeliverableCardData = (content: string, artifactItems: IterationArtifactWorkflowItem[]) => {
  const deliverable = parseArtifactReferenceMessage(content);
  if (!deliverable) {
    return null;
  }
  const matchedArtifact = artifactItems.find((item) => item.title === deliverable.title);
  // 未匹配到 artifact 或 artifact 无实质内容时不渲染卡片
  if (!matchedArtifact) return null;
  const draftLen = (matchedArtifact.draft?.content || "").trim().length;
  if (draftLen < 30) return null;
  const gateStatus = matchedArtifact.gateStatus;
  const matchedKind = resolveArtifactPreviewKind(matchedArtifact.id);
  if (matchedKind !== "analysis-report") {
    return {
      ...deliverable,
      gateStatus,
      summary: compactArtifactCardSummary(matchedArtifact.summary || deliverable.summary, deliverable.summary),
      evidence: deliverable.evidence.length > 0 ? deliverable.evidence : matchedArtifact.evidence || []
    };
  }
  const preview = buildAnalysisArtifactPreview(matchedArtifact.draft?.content || "");
  return {
    ...deliverable,
    gateStatus,
    summary: compactArtifactCardSummary(preview.summary || matchedArtifact.summary || deliverable.summary, deliverable.summary),
    evidence: preview.evidence.length > 0 ? preview.evidence : deliverable.evidence
  };
};

export function ChatMessageList({
  chatMessages,
  artifactItems,
  canOpenAnalysisPanel,
  analysisConfirmed,
  chatSendStatus,
  openAnalysisDrawer,
  openArtifactPreviewByTitle,
  onPreviewFile,
  onConfirmAnalysis,
}: ChatMessageListProps) {
  const displayMessages = useMemo(() => buildIterationChatDisplayItems(chatMessages), [chatMessages]);

  return (
    <>
      {chatMessages.length === 0 ? (
        <div className="empty-state">选好迭代后，直接说你想做什么就行。</div>
      ) : (
        displayMessages.map((item) => {
          const msg = item.leadMessage;
          const cardMessage = item.cardMessage;
          const deliverable = cardMessage ? resolveDeliverableCardData(cardMessage.content, artifactItems) : null;
          const textMessage = item.textMessage;
          const resolvedCardSummary = deliverable ? compactArtifactCardSummary(deliverable.summary || "") : "";
          const hasCardContent = Boolean(deliverable && (resolvedCardSummary || deliverable.evidence.length > 0));
          const rawTextContent = textMessage ? textMessage.content : "";
          const shouldHideTextContent =
            Boolean(textMessage && deliverable && shouldSuppressArtifactTextMessage(rawTextContent, resolvedCardSummary, deliverable.title));
          const textContent = shouldHideTextContent ? "" : rawTextContent;
          const msgKind = getMsgKind(msg);
          const isUploadEvent = msgKind === "event-upload";
          const uploadMeta = isUploadEvent ? parseUploadMeta(msg.content) : null;
          return (
            <div key={item.key} className={`msg-row ${isUploadEvent ? "msg-row-system" : `msg-row-${msg.role}`}`}>
              {(isUploadEvent ? true : msg.role !== "user") ? (
                <div className={`msg-avatar avatar-${isUploadEvent ? "system" : msg.role}`} aria-hidden="true">
                  {isUploadEvent ? "系" : getRoleAvatar(msg.role)}
                </div>
              ) : null}
              <div className={`msg msg-${isUploadEvent ? "system" : msg.role} ${msgKind} ${getMsgTheme(msg)}`}>
                <div className="msg-meta">
                  <span>{isUploadEvent ? "系统" : getRoleLabel(msg.role)}</span>
                  <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                </div>
                {isUploadEvent ? (
                  <>
                    {uploadMeta ? <UploadFileCard meta={uploadMeta} onPreviewFile={onPreviewFile} /> : <p>{msg.content.replace(/\n?<!-- upload(?:-b64)?:[\s\S]*?-->/, "").trim()}</p>}
                  </>
                ) : (
                  <>
                    {textMessage && textContent ? (
                      msg.role === "assistant" ? (
                        <div className={`msg-markdown ${cardMessage ? "msg-mixed-copy" : ""}`} dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(textContent) }} />
                      ) : (
                        <p className={cardMessage ? "msg-mixed-copy" : undefined}>{textContent}</p>
                      )
                    ) : null}
                    {deliverable && hasCardContent ? (
                      <div className="deliverable-msg-card">
                        <div className="deliverable-msg-head">
                          <strong>{deliverable.title}</strong>
                          <span className={`hint ${deliverable.gateStatus === "passed" ? "msg-confirmed-badge" : deliverable.gateStatus === "blocked" ? "msg-blocked-badge" : ""}`}>
                            {deliverable.gateStatus === "passed" ? "已确认" : deliverable.gateStatus === "blocked" ? "已驳回" : "待你确认"}
                          </span>
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
                          <button type="button" className="btn ghost mini" onClick={() => openArtifactPreviewByTitle(deliverable.title)}>
                            查看交付物
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {!textMessage && !deliverable ? (() => {
                      if (msgKind === "event-impact-alert") {
                        const impact = parseChangeImpactMessage(msg.content);
                        if (impact) {
                          return (
                            <div className="impact-alert-bar">
                              <span className="impact-alert-icon">⚡</span>
                              <span>变更影响（{impact.items.length} 项）：{impact.items.join("·")}</span>
                              <span className="impact-alert-note">{impact.note}</span>
                            </div>
                          );
                        }
                      }
                      return <p>{msg.content}</p>;
                    })() : null}
                    {msgKind === "event-analysis" ? (
                      <div className="msg-inline-actions">
                        {!analysisConfirmed ? (
                          <button type="button" className="btn primary mini" onClick={onConfirmAnalysis}>
                            确认分析
                          </button>
                        ) : (
                          <span className="msg-confirmed-badge">已确认</span>
                        )}
                        {canOpenAnalysisPanel ? (
                          <button type="button" className="btn ghost mini" onClick={openAnalysisDrawer}>
                            查看分析报告
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              {msg.role === "user" && !isUploadEvent ? (
                <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                  {getRoleAvatar(msg.role)}
                </div>
              ) : null}
            </div>
          );
        })
      )}
      {(chatSendStatus === "sending" || chatSendStatus === "sent" || chatSendStatus === "processing" || chatSendStatus === "processing-executing" || chatSendStatus === "processing-artifacts" || chatSendStatus === "processing-full-cycle") && chatMessages.length > 0 ? (
        <div className="msg-row msg-row-assistant">
          <div className="msg-avatar avatar-assistant" aria-hidden="true">AI</div>
          <div className="msg msg-assistant msg-typing">
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <p className="typing-status-text">
              {chatSendStatus === "sending" || chatSendStatus === "sent" ? "正在发送..."
                : chatSendStatus === "processing-executing" ? "正在执行指令..."
                : chatSendStatus === "processing-artifacts" ? "正在生成交付物..."
                : chatSendStatus === "processing-full-cycle" ? "全流程执行中..."
                : "正在处理..."}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export { getMsgKind };
