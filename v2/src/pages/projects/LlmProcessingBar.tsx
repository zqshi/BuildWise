/**
 * LLM Processing Bar — shows AI processing status with animated indicator.
 */

type LlmProcessingBarProps = {
  label: string;
  detail?: string;
  percent?: number;
  stage?: string;
};

export function LlmProcessingBar({ label, detail }: LlmProcessingBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "#f0f4ff",
        borderRadius: 6,
        fontSize: 13,
        color: "#4a6fa5",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#4a6fa5",
          animation: "pulse 1.2s ease-in-out infinite",
        }}
      />
      <span>{label}</span>
      {detail ? <span style={{ color: "#8899aa", marginLeft: 4 }}>{detail}</span> : null}
    </div>
  );
}
