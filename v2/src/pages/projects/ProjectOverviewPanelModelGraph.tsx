import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import type { RelationGraphEdge, RelationGraphNode, RelationGraphPayload } from "./projectModelGraphModel";
import type { ModelEntityCard, ModelRuleMapping } from "./projectModelBusinessView";
import { toFriendlyName, toFriendlyRelationType } from "./projectOverviewPanelHelpers";

type RelationTypeFilter = "all" | "one_to_one" | "one_to_many" | "many_to_many";

type Props = {
  relationTypeFilter: RelationTypeFilter;
  setRelationTypeFilter: (value: RelationTypeFilter) => void;
  useMockGraphData: boolean;
  setUseMockGraphData: (updater: (prev: boolean) => boolean) => void;
  relationGraph: RelationGraphPayload;
  relationGraphNodeById: Map<string, RelationGraphNode>;
  filteredRelationGraphEdges: RelationGraphEdge[];
  highlightedEdgeId: string | null;
  setHighlightedEdgeId: (value: string | null | ((current: string | null) => string | null)) => void;
  activeFocusNodeId: string | null;
  hoveredConnectedNodeIds: Set<string> | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (value: string | null | ((current: string | null) => string | null)) => void;
  setHoveredNodeId: (value: string | null) => void;
  graphViewportOffset: { x: number; y: number };
  showNodeLabels: boolean;
  centerGraphOnPoint: (x: number, y: number) => void;
  highlightedEdge: RelationGraphEdge | null;
  hoveredNodeId: string | null;
  selectedNode: RelationGraphNode | null;
  selectedNodeOutgoingEdges: RelationGraphEdge[];
  selectedNodeIncomingEdges: RelationGraphEdge[];
  selectedEntityCard: ModelEntityCard | null;
  selectedRuleMappings: ModelRuleMapping[];
  displayedModelEntityCount: number;
  displayedModelRelations: ModelRelationPayload[];
};

export function ProjectOverviewPanelModelGraph({
  relationTypeFilter,
  setRelationTypeFilter,
  useMockGraphData,
  setUseMockGraphData,
  relationGraph,
  relationGraphNodeById,
  filteredRelationGraphEdges,
  highlightedEdgeId,
  setHighlightedEdgeId,
  activeFocusNodeId,
  hoveredConnectedNodeIds,
  selectedNodeId,
  setSelectedNodeId,
  setHoveredNodeId,
  graphViewportOffset,
  showNodeLabels,
  centerGraphOnPoint,
  highlightedEdge,
  hoveredNodeId,
  selectedNode,
  selectedNodeOutgoingEdges,
  selectedNodeIncomingEdges,
  selectedEntityCard,
  selectedRuleMappings,
  displayedModelEntityCount,
  displayedModelRelations
}: Props) {
  return (
    <div className="info-box model-relation-graph-box">
      <h3>建模节点关系图</h3>
      <div className="model-relation-graph-toolbar">
        <span>关系类型筛选</span>
        <div className="chat-tools">
          <select value={relationTypeFilter} onChange={(event) => setRelationTypeFilter(event.target.value as RelationTypeFilter)}>
            <option value="all">全部</option>
            <option value="one_to_one">一对一</option>
            <option value="one_to_many">一对多</option>
            <option value="many_to_many">多对多</option>
          </select>
          <button type="button" className="btn ghost mini" onClick={() => setUseMockGraphData((prev) => !prev)}>
            {useMockGraphData ? "恢复真实数据" : "加载演示数据"}
          </button>
        </div>
      </div>
      {relationGraph.nodes.length === 0 ? (
        <p className="hint">当前暂无实体关系可视化数据，请先沉淀实体关系后查看图谱。</p>
      ) : (
        <>
          <div className="model-relation-graph" role="img" aria-label="实体关系网络节点图">
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              <g className="model-relation-graph-viewport" transform={`translate(${graphViewportOffset.x} ${graphViewportOffset.y})`}>
                <g className="model-relation-graph-edges">
                  {filteredRelationGraphEdges.map((edge) => {
                    const from = relationGraphNodeById.get(edge.fromEntityId);
                    const to = relationGraphNodeById.get(edge.toEntityId);
                    if (!from || !to) return null;
                    const isHighlight = activeFocusNodeId ? edge.fromEntityId === activeFocusNodeId || edge.toEntityId === activeFocusNodeId : false;
                    const edgeToneClass = activeFocusNodeId ? (isHighlight ? "is-highlight" : "is-dim") : "";
                    return (
                      <line
                        key={edge.id}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        className={`relation-edge relation-edge-${edge.type} ${edgeToneClass} ${highlightedEdgeId === edge.id ? "is-flash" : ""}`.trim()}
                      />
                    );
                  })}
                </g>
                <g className="model-relation-graph-nodes">
                  {relationGraph.nodes.map((node) => {
                    const radius = relationGraph.maxDegree > 0 ? 2.8 + (node.degree / relationGraph.maxDegree) * 2.2 : 3;
                    const isConnected = hoveredConnectedNodeIds ? hoveredConnectedNodeIds.has(node.id) : true;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x} ${node.y})`}
                        className={`relation-node ${isConnected ? "" : "is-dim"} ${selectedNodeId === node.id ? "is-selected" : ""} ${highlightedEdge && (highlightedEdge.fromEntityId === node.id || highlightedEdge.toEntityId === node.id) ? "is-flash" : ""}`.trim()}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onClick={() => {
                          setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
                          centerGraphOnPoint(node.x, node.y);
                        }}
                      >
                        <circle r={radius} className="relation-node-dot" />
                        <title>{node.label} · 连接关系 {node.degree} 条</title>
                        {showNodeLabels ? (
                          <text y={radius + 3.4} textAnchor="middle" className="relation-node-label">
                            {node.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
          </div>
          {!showNodeLabels ? <p className="hint">当前节点较多，已隐藏标签以确保可读性。</p> : null}
          {useMockGraphData ? <p className="hint">当前展示为演示数据（mock），仅用于可视化预览，不会写入项目数据。</p> : null}
          {hoveredNodeId ? <p className="hint">已高亮与「{toFriendlyName(hoveredNodeId)}」直接相连的关系。</p> : null}
          {selectedNode ? <p className="hint">已选中「{selectedNode.label}」，点击同一节点可取消选择。</p> : null}
          {highlightedEdge ? <p className="hint">已定位关系：{toFriendlyName(highlightedEdge.fromEntityId)} → {toFriendlyName(highlightedEdge.toEntityId)}</p> : null}
          {filteredRelationGraphEdges.length === 0 ? <p className="hint">当前筛选下暂无关系边，请切换筛选条件。</p> : null}
          {relationGraph.truncated ? <p className="hint">当前图谱仅展示高关联度前 {relationGraph.nodes.length} 个节点，另有 {relationGraph.hiddenNodeCount} 个节点未展开。</p> : null}
          {relationGraph.unlinkedEntityCount > 0 ? <p className="hint">另有 {relationGraph.unlinkedEntityCount} 个实体尚未形成关系连接。</p> : null}
          {selectedNode ? (
            <div className="model-relation-detail-panel">
              <h4>节点关系明细：{selectedNode.label}</h4>
              <p className="hint">点击条目可在图中定位并闪烁对应关系。</p>
              <div className="model-relation-evidence">
                <p>建模依据：当前项目沉淀数据实体 {displayedModelEntityCount} 个、实体关系 {displayedModelRelations.length} 条；当前选中实体「{selectedNode.label}」关联关系 {selectedNodeOutgoingEdges.length + selectedNodeIncomingEdges.length} 条。</p>
              </div>
              <div className="model-relation-detail-grid">
                <div>
                  {selectedEntityCard ? (
                    <div className="model-entity-detail-card">
                      <p className="hint">实体定义</p>
                      <strong>{selectedEntityCard.title}</strong>
                      <p>{selectedEntityCard.definition}</p>
                      {selectedEntityCard.fieldPreview.length > 0 ? (
                        <div className="model-entity-field-list">
                          {selectedEntityCard.fieldPreview.map((field) => (
                            <code key={`${selectedEntityCard.id}-${field}`}>{field}</code>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p>出边关系（{selectedNodeOutgoingEdges.length}）</p>
                  {selectedNodeOutgoingEdges.length === 0 ? <p className="hint">暂无出边关系</p> : <RelationEdgeList edges={selectedNodeOutgoingEdges} relationGraphNodeById={relationGraphNodeById} setHighlightedEdgeId={setHighlightedEdgeId} centerGraphOnPoint={centerGraphOnPoint} direction="outgoing" />}
                </div>
                <div>
                  {selectedRuleMappings.length > 0 ? (
                    <div className="model-entity-detail-card">
                      <p className="hint">关联规则</p>
                      <ul className="model-inline-list">
                        {selectedRuleMappings.slice(0, 4).map((rule) => (
                          <li key={rule.id}>{rule.name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p>入边关系（{selectedNodeIncomingEdges.length}）</p>
                  {selectedNodeIncomingEdges.length === 0 ? <p className="hint">暂无入边关系</p> : <RelationEdgeList edges={selectedNodeIncomingEdges} relationGraphNodeById={relationGraphNodeById} setHighlightedEdgeId={setHighlightedEdgeId} centerGraphOnPoint={centerGraphOnPoint} direction="incoming" />}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

type RelationEdgeListProps = {
  edges: RelationGraphEdge[];
  relationGraphNodeById: Map<string, RelationGraphNode>;
  setHighlightedEdgeId: (value: string | null | ((current: string | null) => string | null)) => void;
  centerGraphOnPoint: (x: number, y: number) => void;
  direction: "incoming" | "outgoing";
};

function RelationEdgeList({ edges, relationGraphNodeById, setHighlightedEdgeId, centerGraphOnPoint, direction }: RelationEdgeListProps) {
  return (
    <ul>
      {edges.map((edge) => {
        const nodeId = direction === "incoming" ? edge.fromEntityId : edge.toEntityId;
        return (
          <li key={`${direction}-${edge.id}`}>
            <button
              type="button"
              className="relation-detail-link"
              onClick={() => {
                setHighlightedEdgeId(edge.id);
                const from = relationGraphNodeById.get(edge.fromEntityId);
                const to = relationGraphNodeById.get(edge.toEntityId);
                if (from && to) {
                  centerGraphOnPoint((from.x + to.x) / 2, (from.y + to.y) / 2);
                }
              }}
            >
              {toFriendlyName(nodeId)} · {toFriendlyRelationType(edge.type)}
              {edge.name ? ` · ${edge.name}` : ""}
            </button>
            {edge.businessDescription ? <p className="model-relation-business-note">{edge.businessDescription}</p> : null}
            {edge.ontologyBasis ? <p className="model-relation-evidence-line">本体依据：{edge.ontologyBasis}</p> : null}
            {edge.dataBasis?.length ? <p className="model-relation-evidence-line">数据依据：{edge.dataBasis.join(" / ")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
