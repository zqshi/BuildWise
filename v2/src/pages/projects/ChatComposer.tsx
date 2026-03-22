import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { ChatSendStatus, Iteration } from "./iterationWorkspacePanelTypes";

export type ChatComposerProps = {
  currentIteration: Iteration | null;
  chatInput: string;
  chatSendStatus: ChatSendStatus;
  fileInputRef: RefObject<HTMLInputElement>;
  isAnalyzingAttachment: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
  onUploadClick: () => void;
  onChatInputChange: (value: string) => void;
  onComposedSend: () => void;
  chatComposerInputRef: RefObject<HTMLTextAreaElement>;
};

function getPlaceholderByStatus(iteration: Iteration | null) {
  if (!iteration) return "先在右侧选一个迭代，然后我们开始聊";
  const status = iteration.status;
  if (status === "planned") return "聊聊这个迭代要做什么？比如：我想给订单流程加个退款功能";
  if (status === "in-progress") return "有什么需要调整的？直接说就行";
  if (status === "review") return "对交付物有什么意见？哪里需要改？";
  if (status === "blocked") return "遇到什么阻塞了？说说情况";
  return "还有什么需要补充的吗？";
}

export function ChatComposer({
  currentIteration,
  chatInput,
  chatSendStatus,
  fileInputRef,
  isAnalyzingAttachment,
  onUpload,
  onUploadFiles,
  onUploadClick,
  onChatInputChange,
  onComposedSend,
  chatComposerInputRef,
}: ChatComposerProps) {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTriggerRef = useRef<HTMLDivElement | null>(null);
  const folderPickerAttrs = { webkitdirectory: "", directory: "" } as unknown as Record<string, string>;

  useEffect(() => {
    if (!showUploadMenu) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!uploadTriggerRef.current || !target) {
        setShowUploadMenu(false);
        return;
      }
      if (!uploadTriggerRef.current.contains(target)) {
        setShowUploadMenu(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showUploadMenu]);

  return (
    <>
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
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            void onUploadFiles(files);
            event.target.value = "";
          }}
        />
        <div className="upload-trigger" ref={uploadTriggerRef}>
          <button
            type="button"
            className="icon-btn upload-icon-btn"
            onClick={() => setShowUploadMenu((prev) => !prev)}
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
                  setShowUploadMenu(false);
                  onUploadClick();
                }}
              >
                选择文件
              </button>
              <button
                type="button"
                className="btn ghost mini"
                onClick={() => {
                  setShowUploadMenu(false);
                  folderInputRef.current?.click();
                }}
              >
                选择文件夹
              </button>
            </div>
          ) : null}
        </div>
        <textarea
          ref={chatComposerInputRef}
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onComposedSend();
            }
          }}
          onFocus={() => setShowUploadMenu(false)}
          placeholder={getPlaceholderByStatus(currentIteration)}
          aria-label="需求输入框"
          rows={2}
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
    </>
  );
}
