import type { UploadAnalysisProgress } from "./iterationWorkspacePanelTypes";
import { LlmProcessingBar } from "./LlmProcessingBar";

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
  const showProgress = uploadAnalysisProgress && uploadAnalysisProgress.stage !== "succeeded";
  const showFailedHint = lastUploadFailed && !showProgress;
  return (
    <>
      {showProgress ? (
        <div>
          <LlmProcessingBar
            label={uploadAnalysisProgress.label}
            detail={uploadAnalysisProgress.detail}
            percent={uploadAnalysisProgress.percent}
            stage={uploadAnalysisProgress.stage}
          />
          {lastUploadFailed ? (
            <div className="chat-tools upload-tip">
              <button type="button" className="btn primary mini" onClick={() => void onRetryUpload()}>
                重试分析
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {showFailedHint ? (
        <div className="upload-analysis-status stage-failed" role="status">
          <p>上次分析未成功，可以重试或重新上传文件。</p>
          <div className="chat-tools upload-tip">
            <button type="button" className="btn primary mini" onClick={() => void onRetryUpload()}>
              重试分析
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
