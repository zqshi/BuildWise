import { useState, useMemo } from "react";
import type { KnowledgeGraphData } from "../../domain/workspace/knowledgeGraphTypes";
import { buildKnowledgeGraphLayout, getConnectedNodeIds, friendlyRelation, friendlyNodeType } from "./knowledgeGraphModel";

type KnowledgeGraphViewProps = {
  data: KnowledgeGraphData;
  generating: boolean;
  generatedAt?: string;
  onGenerate: () => void;
};

const NODE_COLORS: Record<string, string> = {
  concept: "var(--brand-500)",
  entity: "var(--accent-cyan-500)",
  pattern: "var(--warning-500)",
  rule: "var(--success-500)",
};

const EDGE_COLORS: Record<string, string> = {
  depends_on: "var(--brand-400)",
  extends: "var(--success-400)",
  contradicts: "var(--danger-400)",
  related: "var(--text-muted)",
};

export function KnowledgeGraphView({ data, generating, generatedAt, onGenerate }: KnowledgeGraphViewProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const layout = useMemo(() => buildKnowledgeGraphLayout(data), [data]);
  const connectedIds = useMemo(
    () => hoveredNodeId ? getConnectedNodeIds(layout.edges, hoveredNodeId) : null,
    [layout.edges, hoveredNodeId]
  );

  const hasNodes = layout.nodes.length > 0;

  return (
    <div className="knowledge-graph-section">
      <div className="knowledge-graph-header">
        <button
          type="button"
          className="btn ghost mini"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? "生成中..." : hasNodes ? "刷新图谱" : "生成知识图谱"}
        </button>
        {generatedAt ? <span className="knowledge-graph-time">生成于 {new Date(generatedAt).toLocaleString("zh-CN")}</span> : null}
      </div>

      {hasNodes ? (
        <div className="knowledge-graph-canvas">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <g className="knowledge-graph-edges">
              {layout.edges.map((edge) => {
                const from = layout.nodeById.get(edge.from);
                const to = layout.nodeById.get(edge.to);
                if (!from || !to) return null;
                const isConnected = connectedIds ? connectedIds.has(edge.from) && connectedIds.has(edge.to) : true;
                return (
                  <line
                    key={edge.id}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={EDGE_COLORS[edge.relation] || "var(--border-default)"}
                    strokeWidth={isConnected ? 0.6 : 0.3}
                    opacity={isConnected ? 0.8 : 0.2}
                  />
                );
              })}
            </g>
            <g className="knowledge-graph-nodes">
              {layout.nodes.map((node) => {
                const radius = layout.maxDegree > 0
                  ? 2.2 + (getNodeDegree(layout.edges, node.id) / layout.maxDegree) * 2.3
                  : 2.8;
                const isConnected = connectedIds ? connectedIds.has(node.id) : true;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    opacity={isConnected ? 1 : 0.25}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle r={radius} fill={NODE_COLORS[node.type] || "var(--brand-500)"} stroke="var(--bg-surface)" strokeWidth={0.5} />
                    <text y={radius + 3.2} textAnchor="middle" className="knowledge-graph-label">{node.label}</text>
                    <title>{node.label} ({friendlyNodeType(node.type)}) · 关联 {node.entryIds.length} 条知识</title>
                  </g>
                );
              })}
            </g>
          </svg>
          {hoveredNodeId && layout.nodeById.get(hoveredNodeId) ? (
            <p className="hint">
              已高亮「{layout.nodeById.get(hoveredNodeId)?.label}」及其直接关联节点
            </p>
          ) : null}
          <div className="knowledge-graph-legend">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <span key={type} className="knowledge-graph-legend-item">
                <span className="knowledge-graph-legend-dot" style={{ background: color }} />
                {friendlyNodeType(type)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="hint">{generating ? "正在分析知识库内容，生成知识图谱..." : "点击「生成知识图谱」开始分析知识关联。"}</p>
      )}

      {data.summary ? (
        <div className="knowledge-graph-summary">
          <p className="knowledge-graph-summary-text">{data.summary}</p>
        </div>
      ) : null}

      {data.insights.length > 0 ? (
        <div className="knowledge-graph-insights">
          <h4>知识洞察</h4>
          <ul>
            {data.insights.map((insight, i) => <li key={i}>{insight}</li>)}
          </ul>
        </div>
      ) : null}

      {hasNodes ? (
        <div className="knowledge-graph-edge-list">
          <h4>关系明细（{layout.edges.length}）</h4>
          {layout.edges.slice(0, 10).map((edge) => (
            <span key={edge.id} className="knowledge-graph-edge-item">
              {layout.nodeById.get(edge.from)?.label || edge.from}
              <span className="knowledge-graph-edge-arrow"> → </span>
              {layout.nodeById.get(edge.to)?.label || edge.to}
              <span className="knowledge-graph-edge-type">{friendlyRelation(edge.relation)}</span>
            </span>
          ))}
          {layout.edges.length > 10 ? <p className="hint">仅展示前 10 条关系</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function getNodeDegree(edges: KnowledgeGraphData["edges"], nodeId: string): number {
  let d = 0;
  for (const e of edges) { if (e.from === nodeId || e.to === nodeId) d++; }
  return d;
}
