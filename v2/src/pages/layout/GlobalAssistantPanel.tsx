/**
 * Global Assistant Panel — 全局业务助手工作台
 *
 * Placeholder: will be expanded with cross-project assistant capabilities.
 */

type GlobalAssistantPanelProps = {
  isAdmin: boolean;
  onBack: () => void;
};

export function GlobalAssistantPanel({ onBack }: GlobalAssistantPanelProps) {
  return (
    <div style={{ padding: "2rem" }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: "1rem",
          cursor: "pointer",
          background: "none",
          border: "1px solid #ccc",
          borderRadius: 4,
          padding: "0.4rem 1rem",
        }}
      >
        ← 返回
      </button>
      <h2>业务助手工作台</h2>
      <p style={{ color: "#888" }}>跨项目智能助手功能开发中，敬请期待。</p>
    </div>
  );
}
