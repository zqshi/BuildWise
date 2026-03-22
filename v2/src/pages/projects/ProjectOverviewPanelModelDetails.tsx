import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import type { ProjectModelBusinessSummaryPayload } from "../../domain/workspace/modelOpsTypes";
import type { RelationGraphEdge, RelationGraphNode, RelationGraphPayload } from "./projectModelGraphModel";
import { normalizeInlineMarkdownText, toFriendlyName, toFriendlyRelationType } from "./projectOverviewPanelHelpers";
type RelationTypeFilter = "all" | "one_to_one" | "one_to_many" | "many_to_many";
type Props = {
  showModelDetails: boolean;
  setShowModelDetails: (updater: (prev: boolean) => boolean) => void;
  isUsingMockData: boolean;
  setBusinessSummaryVersion: (updater: (prev: number) => number) => void;
  businessSummaryLoading: boolean;
  modelDetailsView: "summary" | "graph";
  setModelDetailsView: (view: "summary" | "graph") => void;
  relationTypeFilter: RelationTypeFilter;
  setRelationTypeFilter: (value: RelationTypeFilter) => void;
  useMockGraphData: boolean;
  setUseMockGraphData: (updater: (prev: boolean) => boolean) => void;
  relationTypeStats: Array<{ name: string; count: number }>;
  relationFocusEntities: string[];
  businessSummary: ProjectModelBusinessSummaryPayload | null;
  summaryGeneratedAtText: string;
  businessSummaryError: string;
  domainRuleDescriptions: string[];
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
  displayedModelEntityCount: number;
  displayedModelRelations: ModelRelationPayload[];
  displayedModelRuleCount: number;
};
export function ProjectOverviewPanelModelDetails({
  showModelDetails,
  setShowModelDetails,
  isUsingMockData,
  setBusinessSummaryVersion,
  businessSummaryLoading,
  modelDetailsView,
  setModelDetailsView,
  relationTypeFilter,
  setRelationTypeFilter,
  useMockGraphData,
  setUseMockGraphData,
  relationTypeStats,
  relationFocusEntities,
  businessSummary,
  summaryGeneratedAtText,
  businessSummaryError,
  domainRuleDescriptions,
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
  displayedModelEntityCount, displayedModelRelations, displayedModelRuleCount
}: Props) {
  return (
    <div className="info-box project-model-box">
      <div className="panel-head tight">
        <h3>项目建模与领域建模</h3>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => setShowModelDetails((prev) => !prev)}>
            {showModelDetails ? "收起详情" : "查看详情"}
          </button>
          {showModelDetails && !isUsingMockData ? (
            <button type="button" className="btn ghost mini" onClick={() => setBusinessSummaryVersion((prev) => prev + 1)} disabled={businessSummaryLoading}>
              {businessSummaryLoading ? "生成中..." : "重新生成摘要"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="iteration-meta-grid">
        <div className="doc-item">领域规则：{displayedModelRuleCount}</div>
        <div className="doc-item">数据实体：{displayedModelEntityCount}</div>
        <div className="doc-item">实体关系：{displayedModelRelations.length}</div>
      </div>
      {!showModelDetails ? (
        <p className="hint">点击“查看详情”可查看关系结构明细与规则沉淀清单。</p>
      ) : (
        <>
          <div className="model-details-view-switch" role="tablist" aria-label="建模详情视图切换">
            <button
              type="button"
              className={`btn ghost mini ${modelDetailsView === "summary" ? "active" : ""}`}
              role="tab"
              aria-selected={modelDetailsView === "summary"}
              onClick={() => setModelDetailsView("summary")}
            >
              结构化摘要
            </button>
            <button
              type="button"
              className={`btn ghost mini ${modelDetailsView === "graph" ? "active" : ""}`}
              role="tab"
              aria-selected={modelDetailsView === "graph"}
              onClick={() => setModelDetailsView("graph")}
            >
              节点关系图
            </button>
          </div>
          {modelDetailsView === "summary" ? (
            <>
              <div className="info-box">
                <h3>建模明细（关系与实体）</h3>
                <div className="project-summary-kpis project-model-detail-kpis">
                  <div className="doc-item">
                    <span>关系类型</span>
                    <strong>{relationTypeStats.length}</strong>
                  </div>
                  <div className="doc-item">
                    <span>关键实体</span>
                    <strong>{relationFocusEntities.length}</strong>
                  </div>
                  <div className="doc-item">
                    <span>关系总量</span>
                    <strong>{displayedModelRelations.length}</strong>
                  </div>
                  <div className="doc-item">
                    <span>规则覆盖</span>
                    <strong>{displayedModelRuleCount}</strong>
                  </div>
                </div>
                {relationTypeStats.length === 0 ? (
                  <p className="hint">暂无关系类型分布，当前未沉淀实体关系。</p>
                ) : (
                  <ul className="project-highlight-list project-model-detail-list">
                    {relationTypeStats
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 6)
                      .map((item) => (
                        <li key={item.name}>
                          {item.name}：{item.count} 条
                        </li>
                      ))}
                  </ul>
                )}
                {relationFocusEntities.length > 0 ? (
                  <p className="hint">关键实体（按关系频次）：{relationFocusEntities.join("、")}</p>
                ) : null}
                {businessSummary?.model ? (
                  <p className="hint">摘要模型：{normalizeInlineMarkdownText(businessSummary.model)}{summaryGeneratedAtText ? ` · 生成时间：${summaryGeneratedAtText}` : ""}</p>
                ) : null}
                {businessSummaryLoading ? <p className="hint">正在刷新关系明细摘要...</p> : null}
                {businessSummaryError ? <p className="error-inline">模型摘要生成失败：{businessSummaryError}（当前显示结构化明细）</p> : null}
              </div>
              <div className="info-box">
                <h3>领域规则说明（沉淀清单）</h3>
                {domainRuleDescriptions.length === 0 ? (
                  <p className="hint">暂无可读规则说明。</p>
                ) : (
                  <ul>
                    {domainRuleDescriptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
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
                                <title>
                                  {node.label} · 连接关系 {node.degree} 条
                                </title>
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
                  {relationGraph.truncated ? (
                    <p className="hint">
                      当前图谱仅展示高关联度前 {relationGraph.nodes.length} 个节点，另有 {relationGraph.hiddenNodeCount} 个节点未展开。
                    </p>
                  ) : null}
                  {relationGraph.unlinkedEntityCount > 0 ? (
                    <p className="hint">另有 {relationGraph.unlinkedEntityCount} 个实体尚未形成关系连接。</p>
                  ) : null}
                  {selectedNode ? (
                    <div className="model-relation-detail-panel">
                      <h4>节点关系明细：{selectedNode.label}</h4>
                      <p className="hint">点击条目可在图中定位并闪烁对应关系。</p>
                      <div className="model-relation-evidence">
                        <p>
                          建模依据：当前项目沉淀数据实体 {displayedModelEntityCount} 个、实体关系 {displayedModelRelations.length} 条；
                          当前选中实体「{selectedNode.label}」关联关系 {selectedNodeOutgoingEdges.length + selectedNodeIncomingEdges.length} 条。
                        </p>
                      </div>
                      <div className="model-relation-detail-grid">
                        <div>
                          <p>出边关系（{selectedNodeOutgoingEdges.length}）</p>
                          {selectedNodeOutgoingEdges.length === 0 ? (
                            <p className="hint">暂无出边关系</p>
                          ) : (
                            <ul>
                              {selectedNodeOutgoingEdges.map((edge) => (
                                <li key={`out-${edge.id}`}>
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
                                    {toFriendlyName(edge.toEntityId)} · {toFriendlyRelationType(edge.type)}
                                    {edge.name ? ` · ${edge.name}` : ""}
                                  </button>
                                  {edge.businessDescription ? <p className="model-relation-business-note">{edge.businessDescription}</p> : null}{edge.ontologyBasis ? <p className="model-relation-evidence-line">本体依据：{edge.ontologyBasis}</p> : null}{edge.dataBasis?.length ? <p className="model-relation-evidence-line">数据依据：{edge.dataBasis.join(" / ")}</p> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p>入边关系（{selectedNodeIncomingEdges.length}）</p>
                          {selectedNodeIncomingEdges.length === 0 ? (
                            <p className="hint">暂无入边关系</p>
                          ) : (
                            <ul>
                              {selectedNodeIncomingEdges.map((edge) => (
                                <li key={`in-${edge.id}`}>
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
                                    {toFriendlyName(edge.fromEntityId)} · {toFriendlyRelationType(edge.type)}
                                    {edge.name ? ` · ${edge.name}` : ""}
                                  </button>
                                  {edge.businessDescription ? <p className="model-relation-business-note">{edge.businessDescription}</p> : null}
                                  {edge.ontologyBasis ? <p className="model-relation-evidence-line">本体依据：{edge.ontologyBasis}</p> : null}
                                  {edge.dataBasis?.length ? <p className="model-relation-evidence-line">数据依据：{edge.dataBasis.join(" / ")}</p> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
