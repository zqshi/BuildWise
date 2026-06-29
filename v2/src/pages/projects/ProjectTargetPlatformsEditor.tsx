import { useState } from "react";
import { TargetPlatformsPicker } from "./TargetPlatformsPicker";

export type ProjectTargetPlatformsEditorProps = {
  /** 当前项目声明的目标端集合（进入编辑时的初始草稿）。 */
  value: string[];
  /** 保存回调，由父组件调更新接口；返回 Promise 时按钮显示保存中。 */
  onSave: (targetPlatforms: string[]) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * 项目目标端编辑器：本地草稿 + chip 多选 + 保存/取消。
 * 草稿允许暂空（fallbackToWeb=false），保存交后端 normalize 兜底为 ["web"]。
 */
export function ProjectTargetPlatformsEditor({ value, onSave, onCancel }: ProjectTargetPlatformsEditorProps) {
  const [draft, setDraft] = useState<string[]>(value);
  const [saving, setSaving] = useState(false);
  const dirty = draft.join(",") !== value.join(",");

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="target-platforms-editor">
      <TargetPlatformsPicker value={draft} onChange={setDraft} fallbackToWeb={false} />
      <div className="chat-tools">
        <button type="button" className="btn ghost mini" onClick={onCancel} disabled={saving}>
          取消
        </button>
        <button
          type="button"
          className="btn primary mini"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
