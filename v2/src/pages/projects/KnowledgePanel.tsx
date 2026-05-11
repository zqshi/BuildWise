import { useKnowledgeGraph } from "../../hooks/useKnowledgeGraph";
import { KnowledgeGraphView } from "./KnowledgeGraphView";

type KnowledgePanelProps = {
  projectId: number | null;
  onEnterKnowledge?: () => void;
};

const EMPTY_GRAPH = { nodes: [], edges: [], summary: "", insights: [], maxDegree: 0 };

export function KnowledgePanel({ projectId, onEnterKnowledge }: KnowledgePanelProps) {
  const { cache, loading, generating, error, generate } = useKnowledgeGraph(projectId);

  const graphData = cache?.graphData || EMPTY_GRAPH;

  return (
    <section className="knowledge-panel knowledge-panel-summary">
      <div className="panel-head tight">
        <h3>知识库</h3>
        <div className="chat-tools">
          {cache?.entryCount != null ? <span className="knowledge-stats-text">{cache.entryCount} 条知识</span> : null}
          {onEnterKnowledge ? (
            <button type="button" className="btn ghost mini" onClick={onEnterKnowledge}>进入知识库 →</button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="hint">加载中...</p> : null}
      {error ? <p className="hint" style={{ color: "var(--warning-500)" }}>{error}</p> : null}

      {!loading ? (
        <KnowledgeGraphView
          data={graphData}
          generating={generating}
          generatedAt={cache?.generatedAt}
          onGenerate={generate}
        />
      ) : null}
    </section>
  );
}
