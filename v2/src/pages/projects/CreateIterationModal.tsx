import type { FormEvent } from "react";

type CreateIterationModalProps = {
  open: boolean;
  busy: boolean;
  iterName: string;
  iterDesc: string;
  iterGoals: string;
  iterInScope: string;
  iterOutScope: string;
  iterAcceptance: string;
  onClose: () => void;
  onIterNameChange: (value: string) => void;
  onIterDescChange: (value: string) => void;
  onIterGoalsChange: (value: string) => void;
  onIterInScopeChange: (value: string) => void;
  onIterOutScopeChange: (value: string) => void;
  onIterAcceptanceChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateIterationModal({
  open,
  busy,
  iterName,
  iterDesc,
  iterGoals,
  iterInScope,
  iterOutScope,
  iterAcceptance,
  onClose,
  onIterNameChange,
  onIterDescChange,
  onIterGoalsChange,
  onIterInScopeChange,
  onIterOutScopeChange,
  onIterAcceptanceChange,
  onSubmit
}: CreateIterationModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-head">
          <h3>新增迭代版本</h3>
          <button type="button" className="btn ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <label>
            迭代名称
            <input value={iterName} onChange={(event) => onIterNameChange(event.target.value)} required />
          </label>
          <label>
            迭代描述
            <textarea value={iterDesc} onChange={(event) => onIterDescChange(event.target.value)} required />
          </label>
          <label>
            迭代目标（每行一个）
            <textarea value={iterGoals} onChange={(event) => onIterGoalsChange(event.target.value)} />
          </label>
          <label>
            范围内（每行一个）
            <textarea value={iterInScope} onChange={(event) => onIterInScopeChange(event.target.value)} />
          </label>
          <label>
            范围外（每行一个）
            <textarea value={iterOutScope} onChange={(event) => onIterOutScopeChange(event.target.value)} />
          </label>
          <label>
            验收标准（每行一个）
            <textarea value={iterAcceptance} onChange={(event) => onIterAcceptanceChange(event.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "创建中..." : "创建迭代"}
          </button>
        </form>
      </div>
    </div>
  );
}
