import type { CSSProperties, DragEvent, RefObject } from "react";
import { IterationStatusStrip } from "./IterationStatusStrip";
import { ChatMessageList } from "./ChatMessageList";
import { UploadProgressBar } from "./UploadProgressBar";
import { LlmProcessingBar } from "./LlmProcessingBar";
import { ChatComposer } from "./ChatComposer";
import type { UploadFileEntry } from "./UploadFileCard";
import type {
  IterationWorkspacePanelProps,
} from "./iterationWorkspacePanelTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

// ── Types for sub-component props ──

type ChatPanelArticleProps = Pick<
  IterationWorkspacePanelProps,
  | "currentIteration" | "error" | "contextData" | "stateMachine"
  | "chatMessages" | "chatSendStatus" | "chatInput" | "fileInputRef"
  | "isAnalyzingAttachment" | "uploadAnalysisProgress" | "lastUploadFailed"
  | "onUpload" | "onUploadFiles" | "onUploadClick" | "onRetryUpload"
  | "onChatInputChange" | "onTransitionState" | "onSwitchToProjectPanel"
  | "onConfirmArtifact"
> & {
  showInteractionPanel: boolean;
  interactionDrawerWidth: number;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  chatBodyRef: RefObject<HTMLDivElement | null>;
  artifactItems: IterationArtifactWorkflowItem[];
  canOpenAnalysisPanel: boolean;
  reportConfirmedAt: string | null | undefined;
  chatLlmPercent: number;
  isChatProcessing: boolean;
  artifactGenDeclared: string[];
  artifactGenCompleted: string[];
  artifactGenInProgress: boolean;
  artifactGenAllDone: boolean;
  openAnalysisDrawer: () => void;
  openArtifactPreviewByTitle: (title: string) => void;
  openFilePreview: (file: UploadFileEntry, siblings?: UploadFileEntry[]) => void;
  handleConfirmAnalysis: () => void;
  handleComposedSend: () => void;
  chatComposerInputRef: RefObject<HTMLTextAreaElement | null>;
};

/** Main chat panel article — the left column of the workspace. */
export function ChatPanelArticle(p: ChatPanelArticleProps) {
  return (
    <article
      className={`panel chat-panel ${p.showInteractionPanel ? "interaction-companion-open" : ""}`}
      style={{ "--interaction-drawer-offset": `min(${p.interactionDrawerWidth}px, 100vw)` } as CSSProperties}
    >
      <ChatPanelHeader currentIteration={p.currentIteration} onSwitchToProjectPanel={p.onSwitchToProjectPanel} />
      {p.error ? <div className="inline-error-banner" role="alert" aria-live="assertive">{p.error}</div> : null}
      <IterationStatusStrip currentIteration={p.currentIteration} stateMachine={p.stateMachine}
        contextData={p.contextData} onTransitionState={p.onTransitionState} />
      <div className="iteration-workbench-grid">
        <ChatMainColumn p={p} />
      </div>
    </article>
  );
}

function ChatMainColumn({ p }: { p: ChatPanelArticleProps }) {
  return (
    <div className="iteration-chat-main">
      <ChatBodyArea
        dragOver={p.dragOver} setDragOver={p.setDragOver} chatBodyRef={p.chatBodyRef}
        chatMessages={p.chatMessages} chatSendStatus={p.chatSendStatus}
        artifactItems={p.artifactItems} canOpenAnalysisPanel={p.canOpenAnalysisPanel}
        reportConfirmedAt={p.reportConfirmedAt} openAnalysisDrawer={p.openAnalysisDrawer}
        openArtifactPreviewByTitle={p.openArtifactPreviewByTitle}
        openFilePreview={p.openFilePreview} handleConfirmAnalysis={p.handleConfirmAnalysis}
        onUploadFiles={p.onUploadFiles}
      />
      <UploadProgressBar uploadAnalysisProgress={p.uploadAnalysisProgress}
        lastUploadFailed={p.lastUploadFailed} onRetryUpload={p.onRetryUpload} />
      <ChatLlmProgressSection chatSendStatus={p.chatSendStatus} isChatProcessing={p.isChatProcessing}
        isAnalyzingAttachment={p.isAnalyzingAttachment} artifactGenDeclared={p.artifactGenDeclared}
        artifactGenCompleted={p.artifactGenCompleted} artifactGenInProgress={p.artifactGenInProgress}
        artifactGenAllDone={p.artifactGenAllDone} chatLlmPercent={p.chatLlmPercent} />
      <ChatComposer
        currentIteration={p.currentIteration} chatInput={p.chatInput} chatSendStatus={p.chatSendStatus}
        fileInputRef={p.fileInputRef} isAnalyzingAttachment={p.isAnalyzingAttachment}
        onUpload={p.onUpload} onUploadFiles={p.onUploadFiles} onUploadClick={p.onUploadClick}
        onChatInputChange={p.onChatInputChange} onComposedSend={p.handleComposedSend}
        chatComposerInputRef={p.chatComposerInputRef as RefObject<HTMLTextAreaElement>} />
    </div>
  );
}

// ── Small internal sub-components ──

function ChatPanelHeader(props: {
  currentIteration: IterationWorkspacePanelProps["currentIteration"];
  onSwitchToProjectPanel: () => void;
}) {
  return (
    <div className="panel-head">
      <div className="panel-title-wrap">
        <button type="button" className="icon-btn" onClick={props.onSwitchToProjectPanel} aria-label="返回项目管理">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2>迭代内需求沟通</h2>
        <p className="hint">
          {props.currentIteration ? `当前迭代：${props.currentIteration.name}` : "请先在右侧选择迭代版本"}
        </p>
      </div>
    </div>
  );
}

function ChatBodyArea(props: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  chatBodyRef: RefObject<HTMLDivElement | null>;
  chatMessages: IterationWorkspacePanelProps["chatMessages"];
  chatSendStatus: IterationWorkspacePanelProps["chatSendStatus"];
  artifactItems: IterationArtifactWorkflowItem[];
  canOpenAnalysisPanel: boolean;
  reportConfirmedAt: string | null | undefined;
  openAnalysisDrawer: () => void;
  openArtifactPreviewByTitle: (title: string) => void;
  openFilePreview: (file: UploadFileEntry, siblings?: UploadFileEntry[]) => void;
  handleConfirmAnalysis: () => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
}) {
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    props.setDragOver(true);
  };
  const handleDragLeave = () => props.setDragOver(false);
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    props.setDragOver(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      void props.onUploadFiles(files);
    }
  };

  return (
    <div
      className={`chat-body ${props.dragOver ? "drop-active" : ""}`}
      ref={props.chatBodyRef as RefObject<HTMLDivElement>}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatMessageList
        chatMessages={props.chatMessages}
        artifactItems={props.artifactItems}
        canOpenAnalysisPanel={props.canOpenAnalysisPanel}
        analysisConfirmed={Boolean(props.reportConfirmedAt)}
        chatSendStatus={props.chatSendStatus}
        openAnalysisDrawer={props.openAnalysisDrawer}
        openArtifactPreviewByTitle={props.openArtifactPreviewByTitle}
        onPreviewFile={props.openFilePreview}
        onConfirmAnalysis={props.handleConfirmAnalysis}
      />
    </div>
  );
}

function ChatLlmProgressSection(props: {
  chatSendStatus: IterationWorkspacePanelProps["chatSendStatus"];
  isChatProcessing: boolean;
  isAnalyzingAttachment: boolean;
  artifactGenDeclared: string[];
  artifactGenCompleted: string[];
  artifactGenInProgress: boolean;
  artifactGenAllDone: boolean;
  chatLlmPercent: number;
}) {
  const { chatSendStatus } = props;
  const showBar = (chatSendStatus === "sending" || chatSendStatus === "sent" || props.isChatProcessing) && !props.isAnalyzingAttachment;
  if (!showBar) return null;

  return (
    <LlmProcessingBar
      label={buildLlmLabel(chatSendStatus, props.artifactGenAllDone, props.artifactGenInProgress, props.artifactGenCompleted, props.artifactGenDeclared)}
      detail={buildLlmDetail(chatSendStatus, props.artifactGenAllDone, props.artifactGenInProgress, props.artifactGenCompleted)}
      percent={Math.round(props.chatLlmPercent)}
      stage="running"
    />
  );
}

function buildLlmLabel(
  status: string, allDone: boolean, inProgress: boolean,
  completed: string[], declared: string[],
): string {
  if (status === "sending" || status === "sent") return "正在发送消息";
  if (status === "processing-executing") return "AI 正在执行指令";
  if (status === "processing-artifacts") {
    if (allDone) return "交付物生成完毕";
    if (inProgress) return `正在生成交付物（${completed.length}/${declared.length} 已完成）`;
    return "AI 正在生成交付物";
  }
  if (status === "processing-full-cycle") return "全流程执行中";
  return "AI 正在处理";
}

function buildLlmDetail(
  status: string, allDone: boolean, inProgress: boolean,
  completed: string[],
): string {
  if (status === "sending" || status === "sent") return "正在连接 AI 服务...";
  if (status === "processing-executing") return "正在执行指令，请稍候...";
  if (status === "processing-artifacts") {
    if (allDone) return "所有交付物已生成，内容已更新到右侧面板。";
    if (inProgress) return `正在逐个生成，已完成：${completed.length > 0 ? completed.join("、") : "暂无"}。`;
    return "正在后台生成交付物内容，完成后会自动出现...";
  }
  if (status === "processing-full-cycle") return "正在按流程依次执行分析、确认、改写、测试等环节...";
  return "正在等待大模型响应，请稍候...";
}

/** Upload toast notification. */
export function UploadToast(props: {
  uploadToastMessage: string | null;
  onClearUploadToast: () => void;
}) {
  if (!props.uploadToastMessage) return null;
  return (
    <div className="upload-toast" role="status" aria-live="polite">
      <span>{props.uploadToastMessage}</span>
      <button type="button" className="btn ghost mini upload-toast-close" onClick={props.onClearUploadToast}>
        关闭
      </button>
    </div>
  );
}
