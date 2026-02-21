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
          <div>
            <h3>新增迭代版本</h3>
            <p className="hint">先明确本轮目标、范围与验收标准，减少后续理解偏差。</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <section className="modal-section">
            <h4>基础信息</h4>
            <div className="modal-grid-two">
              <label>
                迭代名称
                <input value={iterName} onChange={(event) => onIterNameChange(event.target.value)} required placeholder="例如：v1.3 结算链路优化" />
              </label>
              <label>
                版本类型
                <select
                  value={iterVersionType}
                  onChange={(event) => onIterVersionTypeChange(event.target.value as IterationVersionType)}
                >
                  <option value="patch">修订版本（patch）</option>
                  <option value="minor">小版本（minor）</option>
                  <option value="major">主版本（major）</option>
                </select>
              </label>
            </div>
            <label>
              迭代描述
              <textarea value={iterDesc} onChange={(event) => onIterDescChange(event.target.value)} required placeholder="描述本轮希望解决的问题和业务价值" />
            </label>
          </section>
          <section className="modal-section">
            <h4>目标与范围</h4>
            <label>
              迭代目标（每行一个）
              <textarea value={iterGoals} onChange={(event) => onIterGoalsChange(event.target.value)} placeholder="例如：提升支付成功率至 99.5%" />
            </label>
            <div className="modal-grid-two">
              <label>
                范围内（每行一个）
                <textarea value={iterInScope} onChange={(event) => onIterInScopeChange(event.target.value)} placeholder="本轮必须交付" />
              </label>
              <label>
                范围外（每行一个）
                <textarea value={iterOutScope} onChange={(event) => onIterOutScopeChange(event.target.value)} placeholder="明确不在本轮实现" />
              </label>
            </div>
          </section>
          <section className="modal-section">
            <h4>验收标准</h4>
            <label>
              验收标准（每行一个）
              <textarea value={iterAcceptance} onChange={(event) => onIterAcceptanceChange(event.target.value)} placeholder="可衡量、可验证的验收条件" />
            </label>
          </section>
          <div className="modal-actions">
            {backendUnavailable ? <p className="hint">后端未连接，暂不可创建迭代。请先启动后端服务。</p> : null}
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={busy || backendUnavailable}>
              {busy ? "创建中..." : "创建迭代"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
