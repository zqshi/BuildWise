import type { RefObject, PointerEvent as ReactPointerEvent } from "react";
import type {
  HtmlPreviewInteractionPayload,
  ImageSelectionRegion,
  PrototypeElement,
  PrototypeChangeHistoryItem,
} from "./iterationWorkspacePanelTypes";

export type IterationInteractionDrawerProps = {
  showInteractionPanel: boolean;
  interactionDrawerWidth: number;
  interactionEditMode: boolean;
  htmlPrototypePreviews: { path: string; name: string; content: string }[];
  selectedHtmlPreview: { path: string; name: string; content: string } | null;
  instrumentedHtmlPreview: string;
  imagePrototypePreviews: { path: string; name: string; dataUrl: string }[];
  selectedImagePreview: { path: string; name: string; dataUrl: string } | null;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  selectedImagePoint: { xPercent: number; yPercent: number } | null;
  selectedImageRegion: ImageSelectionRegion | null;
  dragImageRegion: ImageSelectionRegion | null;
  imageSelectionSummary: string;
  interactionInstruction: string;
  prototypeElements: PrototypeElement[];
  prototypeTree: Record<string, Record<string, PrototypeElement[]>>;
  selectedPrototypeElementId: string;
  selectedPrototypeElement: PrototypeElement | null;
  prototypeLastPlan: string[];
  prototypeHistory: PrototypeChangeHistoryItem[];
  htmlPreviewHistory: { path: string; content: string; selector: string; text: string; styles: Record<string, string> }[];
  hasRichInteractionPreview: boolean;
  htmlPreviewFrameRef: RefObject<HTMLIFrameElement>;
  imageWrapRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  onInteractionEditModeChange: (mode: boolean) => void;
  onInteractionInstructionChange: (value: string) => void;
  onSendInteractionInstruction: (instruction: string) => void;
  onUndoHtmlPreview: () => void;
  onSelectedHtmlPreviewPathChange: (path: string) => void;
  onSelectedImagePreviewPathChange: (path: string) => void;
  onSelectedImagePointChange: (point: { xPercent: number; yPercent: number } | null) => void;
  onSelectedImageRegionChange: (region: ImageSelectionRegion | null) => void;
  onSelectedPrototypeElementIdChange: (id: string) => void;
  onPrototypeElementsChange: (updater: (prev: PrototypeElement[]) => PrototypeElement[]) => void;
  onPrototypeHistoryChange: (updater: (prev: PrototypeChangeHistoryItem[]) => PrototypeChangeHistoryItem[]) => void;
  onPrototypeLastPlanChange: (plan: string[]) => void;
  onInteractionDrawerResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onImagePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onImagePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onImagePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onImagePointerCancel: () => void;
};

export function IterationInteractionDrawer(props: IterationInteractionDrawerProps) {
  const {
    showInteractionPanel,
    interactionDrawerWidth,
    interactionEditMode,
    htmlPrototypePreviews,
    selectedHtmlPreview,
    instrumentedHtmlPreview,
    imagePrototypePreviews,
    selectedImagePreview,
    selectedHtmlElement,
    selectedImagePoint,
    selectedImageRegion,
    dragImageRegion,
    imageSelectionSummary,
    interactionInstruction,
    prototypeElements,
    prototypeTree,
    selectedPrototypeElementId,
    selectedPrototypeElement,
    prototypeLastPlan,
    prototypeHistory,
    htmlPreviewHistory,
    hasRichInteractionPreview,
    htmlPreviewFrameRef,
    imageWrapRef,
    onClose,
    onInteractionEditModeChange,
    onInteractionInstructionChange,
    onSendInteractionInstruction,
    onUndoHtmlPreview,
    onSelectedHtmlPreviewPathChange,
    onSelectedImagePreviewPathChange,
    onSelectedImagePointChange,
    onSelectedImageRegionChange,
    onSelectedPrototypeElementIdChange,
    onPrototypeElementsChange,
    onPrototypeHistoryChange,
    onPrototypeLastPlanChange,
    onInteractionDrawerResizePointerDown,
    onImagePointerDown,
    onImagePointerMove,
    onImagePointerUp,
    onImagePointerCancel,
  } = props;

  return (
    <>
      <div
        className={`analysis-drawer-mask interaction-drawer-mask ${showInteractionPanel ? "open" : ""}`}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <aside
        className={`panel interaction-drawer ${showInteractionPanel ? "open" : ""}`}
        style={{ width: `min(${interactionDrawerWidth}px, 100vw)` }}
      >
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="interaction-drawer-resize-handle"
            aria-label="拖拽调整面板宽度"
            title="拖拽调整面板宽度"
            onPointerDown={onInteractionDrawerResizePointerDown}
          />
          <div className="panel-head">
            <h2>交互界面</h2>
            <div className="chat-tools">
              <button
                type="button"
                className={`icon-btn ${interactionEditMode ? "is-active" : ""}`}
                aria-label={interactionEditMode ? "退出编辑模式" : "进入编辑模式"}
                title={interactionEditMode ? "退出编辑模式" : "编辑"}
                onClick={() => onInteractionEditModeChange(!interactionEditMode)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5L9.8 5.3L13.5 7L9.8 8.8L8 12.5L6.2 8.8L2.5 7L6.2 5.3L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="btn ghost mini" onClick={onClose}>
                收起界面
              </button>
            </div>
          </div>
          <div className={`preview-scroll interaction-scroll ${hasRichInteractionPreview ? "is-rich-preview" : "is-legacy-preview"}`}>
            {htmlPrototypePreviews.length > 0 && selectedHtmlPreview ? (
              <div className="interaction-preview-grid">
                <div className="interaction-canvas-wrap">
                  <iframe
                    ref={htmlPreviewFrameRef}
                    title={`html-preview-${selectedHtmlPreview.name}`}
                    className="interaction-html-preview"
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    srcDoc={instrumentedHtmlPreview}
                  />
                  {interactionEditMode ? (
                    <div className="interaction-inline-editor">
                      <span className="interaction-target-chip">{selectedHtmlElement?.tag || "未选中元素"}</span>
                      <input
                        value={interactionInstruction}
                        onChange={(event) => onInteractionInstructionChange(event.target.value)}
                        placeholder="描述想修改的逻辑或样式"
                      />
                      <button
                        type="button"
                        className="btn primary mini"
                        onClick={() => {
                          void onSendInteractionInstruction(interactionInstruction);
                          onInteractionInstructionChange("");
                        }}
                        disabled={!interactionInstruction.trim() || !selectedHtmlElement}
                      >
                        发送
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={onUndoHtmlPreview}
                        disabled={htmlPreviewHistory.length === 0}
                      >
                        撤销上一步
                      </button>
                      <button type="button" className="btn ghost mini" onClick={() => onInteractionInstructionChange("")}>
                        清空
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : imagePrototypePreviews.length > 0 && selectedImagePreview ? (
              <div className="interaction-preview-grid">
                <div className="interaction-canvas-wrap">
                  <div className="info-box">
                    <h3>截图预览</h3>
                    <div className="interaction-tree-elements">
                      {imagePrototypePreviews.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          className={`btn ghost mini ${selectedImagePreview.path === item.path ? "is-active" : ""}`}
                          onClick={() => {
                            onSelectedImagePreviewPathChange(item.path);
                            onSelectedImagePointChange(null);
                            onSelectedImageRegionChange(null);
                          }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                    <p className="hint">当前截图：{selectedImagePreview.path}</p>
                    <p className="hint">支持单击点选与拖拽框选区域，均可作为 IM 修改指令的目标锚点。</p>
                  </div>
                  <button
                    ref={imageWrapRef}
                    type="button"
                    className={`interaction-image-wrap ${interactionEditMode ? "is-editing" : ""}`}
                    onPointerDown={onImagePointerDown}
                    onPointerMove={onImagePointerMove}
                    onPointerUp={onImagePointerUp}
                    onPointerCancel={onImagePointerCancel}
                  >
                    <img className="interaction-image-preview" src={selectedImagePreview.dataUrl} alt={selectedImagePreview.name} />
                    {selectedImageRegion ? (
                      <span
                        className="interaction-image-region"
                        style={{
                          left: `${selectedImageRegion.xPercent}%`,
                          top: `${selectedImageRegion.yPercent}%`,
                          width: `${selectedImageRegion.widthPercent}%`,
                          height: `${selectedImageRegion.heightPercent}%`
                        }}
                      />
                    ) : null}
                    {dragImageRegion ? (
                      <span
                        className="interaction-image-region is-dragging"
                        style={{
                          left: `${dragImageRegion.xPercent}%`,
                          top: `${dragImageRegion.yPercent}%`,
                          width: `${dragImageRegion.widthPercent}%`,
                          height: `${dragImageRegion.heightPercent}%`
                        }}
                      />
                    ) : null}
                    {selectedImagePoint ? (
                      <span
                        className="interaction-image-point"
                        style={{ left: `${selectedImagePoint.xPercent}%`, top: `${selectedImagePoint.yPercent}%` }}
                      />
                    ) : null}
                  </button>
                  {interactionEditMode ? (
                    <div className="interaction-inline-editor">
                      <span className="interaction-target-chip">{selectedImageRegion ? "区域" : selectedImagePoint ? "点位" : "未选中"}</span>
                      <input
                        value={interactionInstruction}
                        onChange={(event) => onInteractionInstructionChange(event.target.value)}
                        placeholder={imageSelectionSummary || "先点选或框选，再描述想修改的逻辑或样式"}
                      />
                      <button
                        type="button"
                        className="btn primary mini"
                        onClick={() => {
                          onSendInteractionInstruction(interactionInstruction);
                          onInteractionInstructionChange("");
                        }}
                        disabled={!interactionInstruction.trim() || (!selectedImageRegion && !selectedImagePoint)}
                      >
                        发送
                      </button>
                      <button type="button" className="btn ghost mini" onClick={() => onInteractionInstructionChange("")}>
                        清空
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="interaction-tree">
                  {Object.entries(prototypeTree).map(([pageName, componentMap]) => (
                    <div key={pageName} className="interaction-tree-group">
                      <p className="hint">页面：{pageName}</p>
                      {Object.entries(componentMap).map(([componentName, elements]) => (
                        <div key={`${pageName}-${componentName}`} className="interaction-tree-node">
                          <p className="hint">组件：{componentName}</p>
                          <div className="interaction-tree-elements">
                            {elements.map((element) => (
                              <button
                                key={element.id}
                                type="button"
                                className={`btn ghost mini ${selectedPrototypeElementId === element.id ? "is-active" : ""}`}
                                onClick={() => onSelectedPrototypeElementIdChange(element.id)}
                              >
                                {element.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="interaction-canvas-wrap">
                  <div className="interaction-canvas">
                    {prototypeElements
                      .filter((item) => item.visible)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`interaction-element ${selectedPrototypeElementId === item.id ? "selected" : ""}`}
                          style={{
                            background: item.background,
                            color: item.color,
                            fontWeight: item.emphasized ? 700 : 500,
                            width: `${item.width}px`,
                            minHeight: `${item.height}px`
                          }}
                          onClick={() => onSelectedPrototypeElementIdChange(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                  <div className="info-box">
                    <h3>属性面板</h3>
                    <p>当前选中：{selectedPrototypeElement?.label || "未选中元素"}</p>
                    <p className="hint">页面：{selectedPrototypeElement?.page || "-"}</p>
                    <p className="hint">组件：{selectedPrototypeElement?.component || "-"}</p>
                    <p className="hint">尺寸：{selectedPrototypeElement ? `${selectedPrototypeElement.width} × ${selectedPrototypeElement.height}` : "-"}</p>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={() =>
                          selectedPrototypeElement &&
                          onPrototypeElementsChange((prev) =>
                            prev.map((item) => (item.id === selectedPrototypeElement.id ? { ...item, visible: !item.visible } : item))
                          )
                        }
                      >
                        {selectedPrototypeElement?.visible ? "隐藏元素" : "显示元素"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={() =>
                          selectedPrototypeElement &&
                          onPrototypeElementsChange((prev) =>
                            prev.map((item) => (item.id === selectedPrototypeElement.id ? { ...item, emphasized: !item.emphasized } : item))
                          )
                        }
                      >
                        {selectedPrototypeElement?.emphasized ? "取消强调" : "强调元素"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={prototypeHistory.length === 0}
                        onClick={() => {
                          const latest = prototypeHistory[0];
                          if (!latest) {
                            return;
                          }
                          onPrototypeElementsChange((prev) => prev.map((item) => (item.id === latest.targetId ? latest.before : item)));
                          onPrototypeHistoryChange((prev) => prev.slice(1));
                          onPrototypeLastPlanChange([`已撤销：${latest.summary}`]);
                        }}
                      >
                        撤销上一步
                      </button>
                    </div>
                    <p className="hint">在 IM 输入框中描述修改并发送。示例：文案改为"提交审批"、改成绿色、宽 520、高 56、隐藏、变大。</p>
                    {prototypeLastPlan.length > 0 ? (
                      <>
                        <p className="hint">解析预览：</p>
                        <ul className="history-list">
                          {prototypeLastPlan.map((item) => (
                            <li key={item} className="history-item">
                              <p>{item}</p>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {prototypeHistory.length > 0 ? (
                      <>
                        <p className="hint">最近变更：</p>
                        <ul className="history-list">
                          {prototypeHistory.slice(0, 3).map((item) => (
                            <li key={item.id} className="history-item">
                              <p>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {item.summary}</p>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </article>
      </aside>
    </>
  );
}
