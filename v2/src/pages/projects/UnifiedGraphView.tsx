import { useState, useMemo } from "react";
import type { UnifiedGraphData, UnifiedGraphEdge, UnifiedGraphNode } from "../../domain/workspace/unifiedGraphTypes";
import { getUnifiedConnectedNodeIds, friendlyEdgeLabel, friendlyNodeSource } from "./unifiedGraphModel";
import { friendlyNodeType } from "./knowledgeGraphModel";

type Props = {
  data: UnifiedGraphData;
  generating: boolean;
  onGenerate: () => void;
};

const KNOWLEDGE_NODE_COLORS: Record<string, string> = {
  concept: "var(--brand-500)",
  entity: "var(--accent-cyan-500)",
  pattern: "var(--warning-500)",
  rule: "var(--success-500)",
};

const SEMANTIC_EDGE_COLORS: Record<string, string> = {
  depends_on: "var(--brand-400)",
  extends: "var(--success-400)",
  contradicts: "var(--danger-400)",
  related: "var(--text-muted)",
};

const MODEL_EDGE_COLOR = "var(--accent-cyan-400)";
const MODEL_NODE_COLOR = "var(--accent-cyan-500)";
const BOTH_NODE_COLOR = "var(--brand-500)";

function nodeColor(node: UnifiedGraphNode): string {
  if (node.source === "both") return BOTH_NODE_COLOR;
  if (node.source === "model") return MODEL_NODE_COLOR;
  return KNOWLEDGE_NODE_COLORS[node.knowledgeNodeType ?? "concept"] ?? "var(--brand-500)";
}

function edgeColor(edge: UnifiedGraphEdge): string {
  if (edge.source === "model") return MODEL_EDGE_COLOR;
  return SEMANTIC_EDGE_COLORS[edge.semanticRelation ?? "related"] ?? "var(--text-muted)";
}

function nodeRadius(node: UnifiedGraphNode, maxDegree: number): number {
  const base = node.source === "model" ? 3 : 2.5;
  return maxDegree > 0 ? base + (node.degree / maxDegree) * 2 : base;
}

function NodeShape({ node, r, isConnected, isSelected, onEnter, onLeave, onClick }: {
  node: UnifiedGraphNode; r: number; isConnected: boolean; isSelected: boolean;
  onEnter: () => void; onLeave: () => void; onClick: () => void;
}) {
  const color = nodeColor(node);
  const opacity = isConnected ? 1 : 0.2;
  const showLabel = true;
  const isNew = node.isNew === true;
  const nodeStroke = isNew ? "var(--warning-500, #f0a020)" : "var(--bg-surface)";
  const nodeStrokeWidth = isNew ? 1.2 : 0.5;
  const newBadge = isNew ? " · 新增" : "";

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      opacity={opacity}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ cursor: "pointer" }}
      className={isSelected ? "unified-node-selected" : ""}
    >
      {node.source === "model" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={0.8} fill={color} stroke={nodeStroke} strokeWidth={nodeStrokeWidth} />
      ) : node.source === "both" ? (
        <>
          <rect x={-r - 1} y={-r - 1} width={(r + 1) * 2} height={(r + 1) * 2} rx={1} fill="none" stroke={MODEL_NODE_COLOR} strokeWidth={0.5} strokeDasharray="1.5 0.8" />
          <circle r={r} fill={color} stroke={nodeStroke} strokeWidth={nodeStrokeWidth} />
        </>
      ) : (
        <circle r={r} fill={color} stroke={nodeStroke} strokeWidth={nodeStrokeWidth} />
      )}
      {showLabel ? (
        <text y={r + 3.4} textAnchor="middle" className="unified-graph-label">{node.label}</text>
      ) : null}
      <title>{node.label} ({friendlyNodeSource(node.source)}{node.knowledgeNodeType ? ` · ${friendlyNodeType(node.knowledgeNodeType)}` : ""}) · 关联 {node.degree} 条{newBadge}</title>
    </g>
  );
}

function EdgeLine({ edge, fromNode, toNode, isConnected }: {
  edge: UnifiedGraphEdge; fromNode: UnifiedGraphNode; toNode: UnifiedGraphNode; isConnected: boolean;
}) {
  const color = edgeColor(edge);
  const isDashed = edge.source === "knowledge";
  return (
    <line
      x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y}
      stroke={color}
      strokeWidth={isConnected ? 0.6 : 0.3}
      opacity={isConnected ? 0.8 : 0.15}
      strokeDasharray={isDashed ? "2 1.5" : undefined}
    />
  );
}

export function UnifiedGraphView({ data, generating, onGenerate }: Props) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const activeFocusId = hoveredNodeId ?? selectedNodeId;
  const connectedIds = useMemo(
    () => activeFocusId ? getUnifiedConnectedNodeIds(data.edges, activeFocusId) : null,
    [data.edges, activeFocusId]
  );

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const hasNodes = data.nodes.length > 0;

  return (
    <div className="unified-graph-section">
      <div className="unified-graph-toolbar">
        <div className="unified-graph-stats">
          <span>领域实体 {data.modelNodeCount}</span>
          <span>知识概念 {data.knowledgeNodeCount}</span>
          {data.mergedNodeCount > 0 ? <span>重合 {data.mergedNodeCount}</span> : null}
        </div>
        <button type="button" className="btn ghost mini" onClick={onGenerate} disabled={generating}>
          {generating ? "生成中..." : "刷新知识图谱"}
        </button>
      </div>

      {hasNodes ? (
        <div className="unified-graph-canvas">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <g className="unified-graph-edges">
              {data.edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);
                if (!from || !to) return null;
                const isConn = connectedIds ? connectedIds.has(edge.from) && connectedIds.has(edge.to) : true;
                return <EdgeLine key={edge.id} edge={edge} fromNode={from} toNode={to} isConnected={isConn} />;
              })}
            </g>
            <g className="unified-graph-nodes">
              {data.nodes.map((node) => {
                const r = nodeRadius(node, data.maxDegree);
                const isConn = connectedIds ? connectedIds.has(node.id) : true;
                return (
                  <NodeShape
                    key={node.id} node={node} r={r}
                    isConnected={isConn}
                    isSelected={selectedNodeId === node.id}
                    onEnter={() => setHoveredNodeId(node.id)}
                    onLeave={() => setHoveredNodeId(null)}
                    onClick={() => setSelectedNodeId((prev) => prev === node.id ? null : node.id)}
                  />
                );
              })}
            </g>
          </svg>

          <div className="unified-graph-legend">
            <span className="unified-graph-legend-item"><span className="unified-graph-legend-rect" style={{ background: MODEL_NODE_COLOR }} />领域实体</span>
            <span className="unified-graph-legend-item"><span className="unified-graph-legend-dot" style={{ background: "var(--brand-500)" }} />知识概念</span>
            <span className="unified-graph-legend-item"><span className="unified-graph-legend-dot" style={{ background: BOTH_NODE_COLOR, border: `1.5px dashed ${MODEL_NODE_COLOR}` }} />双来源</span>
            <span className="unified-graph-legend-item"><span className="unified-graph-legend-line" style={{ background: MODEL_EDGE_COLOR }} />ER 关系</span>
            <span className="unified-graph-legend-item"><span className="unified-graph-legend-line-dashed" style={{ borderColor: "var(--text-muted)" }} />语义关系</span>
          </div>

          {hoveredNodeId && nodeById.get(hoveredNodeId) ? (
            <p className="hint">已高亮「{nodeById.get(hoveredNodeId)?.label}」及其直接关联节点</p>
          ) : null}
          {data.truncated ? <p className="hint">当前图谱仅展示高关联度前 {data.nodes.length} 个节点，另有 {data.hiddenNodeCount} 个节点未展开。</p> : null}
        </div>
      ) : (
        <p className="hint">{generating ? "正在分析知识库内容..." : "暂无图谱数据。请先沉淀迭代分析或生成知识图谱。"}</p>
      )}

      {selectedNode ? (
        <div className="unified-graph-detail-panel">
          <h4>{selectedNode.label} <span className="unified-graph-source-badge">{friendlyNodeSource(selectedNode.source)}</span></h4>
          {selectedNode.fieldCount ? <p className="hint">字段数：{selectedNode.fieldCount}</p> : null}
          {selectedNode.knowledgeNodeType ? <p className="hint">知识类型：{friendlyNodeType(selectedNode.knowledgeNodeType)}</p> : null}
          {selectedNode.knowledgeEntryIds?.length ? <p className="hint">关联知识条目：{selectedNode.knowledgeEntryIds.length} 条</p> : null}
          <div className="unified-graph-detail-edges">
            <p>关联关系（{data.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id).length}）</p>
            <ul>
              {data.edges
                .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
                .slice(0, 8)
                .map((e) => {
                  const other = e.from === selectedNode.id ? nodeById.get(e.to) : nodeById.get(e.from);
                  return (
                    <li key={e.id}>
                      {other?.label ?? "?"} · {friendlyEdgeLabel(e)} {e.source === "knowledge" ? "(语义)" : "(ER)"}
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      ) : null}

      {data.knowledgeSummary ? (
        <div className="unified-graph-ai-summary">
          <p>{data.knowledgeSummary}</p>
          {data.knowledgeGeneratedAt ? (
            <span className="unified-graph-time">知识图谱生成于 {new Date(data.knowledgeGeneratedAt).toLocaleString("zh-CN")}</span>
          ) : null}
        </div>
      ) : null}

      {data.knowledgeInsights.length > 0 ? (
        <div className="unified-graph-insights">
          <h4>知识洞察</h4>
          <ul>{data.knowledgeInsights.map((insight, i) => <li key={i}>{insight}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
