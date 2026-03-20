import type { UploadAnalysisProgress } from "./iterationWorkspacePanelTypes";

export type UploadProgressBarProps = {
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  lastUploadFailed: boolean;
  onRetryUpload: () => void | Promise<void>;
};

export function UploadProgressBar({
  uploadAnalysisProgress,
  lastUploadFailed,
  onRetryUpload,
}: UploadProgressBarProps) {
  return (
    <>
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
    </>
  );
}
