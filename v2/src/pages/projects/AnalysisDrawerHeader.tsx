import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

export type AnalysisDrawerHeaderProps = {
  selectedDrawerArtifact: IterationArtifactWorkflowItem | null;
  artifactDrawerWidth: number;
  onCloseAnalysisPanel: () => void;
  openInteractionPanel: () => void;
  handleArtifactDrawerResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function AnalysisDrawerHeader({
  selectedDrawerArtifact,
  artifactDrawerWidth,
  onCloseAnalysisPanel,
  openInteractionPanel,
  handleArtifactDrawerResizePointerDown,
}: AnalysisDrawerHeaderProps) {
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
        </article>
      </aside>
    </>
  );
}
