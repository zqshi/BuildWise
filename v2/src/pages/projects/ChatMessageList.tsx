import { useMemo } from "react";
import {
  buildIterationChatDisplayItems,
  compactArtifactCardSummary,
  parseArtifactReferenceMessage,
  shouldSuppressArtifactTextMessage
} from "../../app/workspaceChatMessagePresentation";
import { buildAnalysisArtifactPreview } from "./analysisArtifactPresenter";
import { resolveArtifactPreviewKind } from "./iterationWorkspacePanelUtils";
import type { IterationMessage } from "./iterationWorkspacePanelTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

export type ChatMessageListProps = {
  chatMessages: IterationMessage[];
  artifactItems: IterationArtifactWorkflowItem[];
  canOpenAnalysisPanel: boolean;
  showInteractionEntry: boolean;
  lastUploadMessageId: number | undefined;
  openAnalysisDrawer: () => void;
  openInteractionPanel: () => void;
  openArtifactPreviewByTitle: (title: string) => void;
};

const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "迭代教练" : "系统");
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

const getMsgTheme = (msg: IterationMessage) => {
  const content = msg.content.toLowerCase();
  if (content.includes("风险") || content.includes("阻塞")) {
    return "theme-risk";
  }
  if (content.includes("完成") || content.includes("通过") || content.includes("success")) {
    return "theme-success";
  }
  if (content.includes("分析") || content.includes("差异") || content.includes("附件")) {
    return "theme-analysis";
  }
  return "theme-default";
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

const resolveGuidanceText = (_content: string) => {
  return "";
};

const resolveDeliverableCardData = (content: string, artifactItems: IterationArtifactWorkflowItem[]) => {
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

export function ChatMessageList({
  chatMessages,
  artifactItems,
  canOpenAnalysisPanel,
  showInteractionEntry,
  lastUploadMessageId,
  openAnalysisDrawer,
  openInteractionPanel,
  openArtifactPreviewByTitle,
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
              <div className={`msg msg-${msg.role} ${getMsgKind(msg)} ${getMsgTheme(msg)}`}>
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
                      <button type="button" className="btn ghost mini" onClick={() => openArtifactPreviewByTitle(deliverable.title)}>
                        查看交付物
                      </button>
                    </div>
                  </div>
                ) : null}
                {!textMessage && !deliverable ? <p>{resolveGuidanceText(msg.content) || msg.content}</p> : null}
                {getMsgKind(msg) === "event-upload" && msg.id === lastUploadMessageId ? (
                  <div className="msg-inline-actions">
                    {canOpenAnalysisPanel ? (
                      <button type="button" className="btn ghost mini attachment-report-entry" onClick={openAnalysisDrawer}>
                        查看分析报告
                      </button>
                    ) : null}
                    {showInteractionEntry ? (
                      <button type="button" className="btn ghost mini" onClick={openInteractionPanel}>
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
          );
        })
      )}
    </>
  );
}

export { getMsgKind };
