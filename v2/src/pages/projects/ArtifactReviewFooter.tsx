import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

export type ArtifactReviewFooterProps = {
  selectedDrawerArtifact: IterationArtifactWorkflowItem;
  selectedArtifactAwaitingConfirmation: boolean;
  artifactEditorBusy: boolean;
  handleConfirmSelectedArtifact: () => Promise<void>;
  handleRequestArtifactRevision: () => void;
};

export function ArtifactReviewFooter({
  selectedDrawerArtifact,
  selectedArtifactAwaitingConfirmation,
  artifactEditorBusy,
  handleConfirmSelectedArtifact,
  handleRequestArtifactRevision,
}: ArtifactReviewFooterProps) {
  const isConfirmed = selectedDrawerArtifact.gateStatus === "passed";
  return (
    <footer className="artifact-review-footer">
      <p>
        当前版本：v{selectedDrawerArtifact.outputVersion || 0} · 状态：
        {isConfirmed
          ? " 已确认"
          : selectedDrawerArtifact.outputVersion > 0
            ? " 分析待确认"
            : " 等待确认分析"}
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
        {isConfirmed ? (
          <span className="btn ghost mini confirmed-badge">已确认</span>
        ) : (
          <button
            type="button"
            className="btn primary mini"
            onClick={() => void handleConfirmSelectedArtifact()}
            disabled={!selectedArtifactAwaitingConfirmation || artifactEditorBusy}
          >
            {artifactEditorBusy ? "确认中..." : "确认分析"}
          </button>
        )}
        <button type="button" className="btn ghost mini" onClick={handleRequestArtifactRevision}>
          去对话中提调整
        </button>
      </div>
    </footer>
  );
}
