import type { FormEvent } from "react";
import type { IterationVersionType } from "../../domain/workspace/iterationTypes";

type CreateIterationModalProps = {
  open: boolean;
  busy: boolean;
  backendUnavailable?: boolean;
  iterName: string;
  iterDesc: string;
  iterGoals: string;
  iterInScope: string;
  iterOutScope: string;
  iterAcceptance: string;
  iterVersionType: IterationVersionType;
  onClose: () => void;
  onIterNameChange: (value: string) => void;
  onIterDescChange: (value: string) => void;
  onIterGoalsChange: (value: string) => void;
  onIterInScopeChange: (value: string) => void;
  onIterOutScopeChange: (value: string) => void;
  onIterAcceptanceChange: (value: string) => void;
  onIterVersionTypeChange: (value: IterationVersionType) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateIterationModal({
  open,
  busy,
  backendUnavailable = false,
  iterName,
  iterDesc,
  iterGoals,
  iterInScope,
  iterOutScope,
  iterAcceptance,
  iterVersionType,
  onClose,
  onIterNameChange,
  onIterDescChange,
  onIterGoalsChange,
  onIterInScopeChange,
  onIterOutScopeChange,
  onIterAcceptanceChange,
  onIterVersionTypeChange,
  onSubmit
}: CreateIterationModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-mask">
      <div className="modal-card iteration-modal-card">
        <div className="modal-head">
          <div className="iteration-modal-title-wrap">
            <div className="iteration-modal-title">
              <span className="iteration-modal-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M9.5 14.5c-1.3-.1-2.4.1-3.4.6.5-1 1.3-1.8 2.2-2.5L13.8 7c1.8-1.8 4.5-2.5 7-2-.2 2.5-1 5.2-2.8 7l-5.5 5.5c-.7 1-1.6 1.7-2.5 2.2.5-1 .7-2.1.6-3.4Z" fill="currentColor" />
                  <circle cx="15.8" cy="8.2" r="1.2" fill="#fff" />
                </svg>
              </span>
              <h3>新建交付迭代</h3>
            </div>
          </div>
          <button type="button" className="icon-btn iteration-modal-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form id="create-iteration-form" onSubmit={onSubmit} className="modal-form iteration-modal-form">
          <section className="iteration-modal-block">
            <label>
              <span className="modal-label-inline">
                迭代名称 <span className="form-required">*</span>
              </span>
              <input value={iterName} onChange={(event) => onIterNameChange(event.target.value)} required placeholder="例如：V1.0 核心功能迭代" />
            </label>
            <label>
              版本类型
              <div className="iteration-type-radio-group compact">
                <label className={`iteration-type-radio ${iterVersionType === "major" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="iteration-version-type"
                    checked={iterVersionType === "major"}
                    onChange={() => onIterVersionTypeChange("major")}
                  />
                  <span>
                    <strong>Major</strong>
                    <em>涉及架构变动或大规模功能更新</em>
                  </span>
                </label>
                <label className={`iteration-type-radio ${iterVersionType === "minor" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="iteration-version-type"
                    checked={iterVersionType === "minor"}
                    onChange={() => onIterVersionTypeChange("minor")}
                  />
                  <span>
                    <strong>Minor</strong>
                    <em>功能优化或业务扩展增强</em>
                  </span>
                </label>
                <label className={`iteration-type-radio ${iterVersionType === "patch" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="iteration-version-type"
                    checked={iterVersionType === "patch"}
                    onChange={() => onIterVersionTypeChange("patch")}
                  />
                  <span>
                    <strong>Patch</strong>
                    <em>线上缺陷修复或小范围改动</em>
                  </span>
                </label>
              </div>
            </label>
            <label>
              目标描述
              <textarea value={iterDesc} onChange={(event) => onIterDescChange(event.target.value)} required placeholder="描述此迭代的核心目标及预期成果..." />
            </label>
          </section>

          <section className="iteration-modal-block">
            <div className="modal-grid-two compact">
              <label>
                范围内功能列表
                <textarea value={iterInScope} onChange={(event) => onIterInScopeChange(event.target.value)} rows={3} placeholder="输入本期涵盖的功能点，按行分隔" />
              </label>
              <label>
                范围外说明
                <textarea value={iterOutScope} onChange={(event) => onIterOutScopeChange(event.target.value)} rows={3} placeholder="输入本期不涉及的功能或明确排除的项" />
              </label>
            </div>
          </section>

          <section className="iteration-modal-block">
            <div className="iteration-acceptance-checklist">
              <label>
                <input type="checkbox" checked readOnly />
                <span>通过自动化冒烟测试（用例通过率 100%）</span>
              </label>
              <label>
                <input type="checkbox" checked readOnly />
                <span>P0/P1 缺陷全部关闭</span>
              </label>
              <button type="button" className="auth-link-btn">+ 添加自定义标准</button>
            </div>
            <textarea
              className="modal-hidden-field-control"
              value={iterAcceptance}
              onChange={(event) => onIterAcceptanceChange(event.target.value)}
              rows={1}
            />
          </section>

          <label className="modal-hidden-field" aria-hidden="true">
            迭代目标
            <textarea value={iterGoals} onChange={(event) => onIterGoalsChange(event.target.value)} rows={1} />
          </label>
        </form>
        <div className="modal-actions iteration-modal-actions">
          {backendUnavailable ? <p className="hint">后端未连接，暂不可创建迭代。请先启动后端服务。</p> : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="create-iteration-form" className="btn primary" disabled={busy || backendUnavailable}>
            {busy ? "创建中..." : "确认创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
