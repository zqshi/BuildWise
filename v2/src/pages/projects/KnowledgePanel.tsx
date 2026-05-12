import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";

type KnowledgePanelProps = {
  projectId: number | null;
  onEnterKnowledge?: () => void;
};

export function KnowledgePanel({ projectId, onEnterKnowledge }: KnowledgePanelProps) {
  const { cache, loading } = useKnowledgeGraph(projectId);

  return (
    <section className="knowledge-panel knowledge-panel-summary">
      <div className="panel-head tight">
        <h3>知识库</h3>
        <div className="chat-tools">
          {cache?.entryCount != null ? <span className="knowledge-stats-text">{cache.entryCount} 条知识</span> : null}
          {cache?.generatedAt ? (
            <span className="knowledge-stats-text">图谱 {new Date(cache.generatedAt).toLocaleDateString("zh-CN")}</span>
          ) : null}
          {onEnterKnowledge ? (
            <button type="button" className="btn ghost mini" onClick={onEnterKnowledge}>进入知识库 →</button>
          ) : null}
        </div>
      </div>
      {loading ? <p className="hint">加载中...</p> : (
        <p className="hint">知识图谱已集成至上方「项目全景图谱」中展示。点击「进入知识库」管理知识条目。</p>
      )}
    </section>
  );
}
