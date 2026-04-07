/**
 * Change Impact Alert — displays stale artifact warnings after analysis updates.
 */

type ChangeImpact = {
  hasImpact?: boolean;
  staleItems?: Array<{ title: string }>;
  affectedArtifacts?: string[];
  affectedTerms?: string[];
  affectedEntities?: string[];
  affectedRules?: string[];
  message?: string;
  summary?: string;
};

type ChangeImpactAlertProps = {
  impact: ChangeImpact | null;
  onDismiss: () => void;
};

export function ChangeImpactAlert({ impact, onDismiss }: ChangeImpactAlertProps) {
  if (!impact) return null;

  const items = impact.staleItems ?? [];
  const affected = impact.affectedArtifacts ?? [];
  const message = impact.message
    ?? impact.summary
    ?? (items.length > 0
      ? `以下交付物可能受到影响：${items.map(i => i.title).join("、")}`
      : affected.length > 0
        ? `以下交付物可能受到影响：${affected.join("、")}`
        : "检测到变更影响，请检查相关交付物。");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "#fff8e6",
        border: "1px solid #f0d060",
        borderRadius: 6,
        fontSize: 13,
        color: "#8a6d00",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#8a6d00",
          fontWeight: 600,
          padding: "2px 8px",
        }}
      >
        关闭
      </button>
    </div>
  );
}
