import type { FormEvent } from "react";
import { TargetPlatformsPicker } from "./TargetPlatformsPicker";

type CreateProjectModalProps = {
  open: boolean;
  busy: boolean;
  backendUnavailable?: boolean;
  projectName: string;
  projectDesc: string;
  errorMessage?: string | null;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onDescChange: (value: string) => void;
  /** 创建项目时声明的目标端集合。 */
  targetPlatforms: string[];
  onTargetPlatformsChange: (value: string[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateProjectModal({
  open,
  busy,
  backendUnavailable = false,
  projectName,
  projectDesc,
  errorMessage,
  onClose,
  onNameChange,
  onDescChange,
  targetPlatforms,
  onTargetPlatformsChange,
  onSubmit
}: CreateProjectModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-head">
          <h3>新建项目</h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="关闭弹窗">
            关闭
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label>
            项目名称
            <input value={projectName} onChange={(event) => onNameChange(event.target.value)} required />
          </label>
          <label>
            项目描述
            <textarea value={projectDesc} onChange={(event) => onDescChange(event.target.value)} required />
          </label>
          <fieldset className="form-fieldset target-platforms-field">
            <legend>目标端</legend>
            <p className="hint">声明本项目交付物面向的运行端，发布评审将按端分别校验（至少保留一个）。</p>
            <TargetPlatformsPicker value={targetPlatforms} onChange={onTargetPlatformsChange} />
          </fieldset>
          {backendUnavailable ? <p className="hint">后端未连接，暂不可创建项目。请先启动后端服务。</p> : null}
          {errorMessage ? <p className="error-inline">{errorMessage}</p> : null}
          <button type="submit" className="btn primary" disabled={busy || backendUnavailable}>
            {busy ? "创建中..." : "创建项目"}
          </button>
        </form>
      </div>
    </div>
  );
}
