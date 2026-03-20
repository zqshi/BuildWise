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
  return (
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
  );
}
