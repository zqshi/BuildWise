import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import type { ProjectModelBusinessSummaryPayload } from "../../domain/workspace/modelOpsTypes";
import type { RelationGraphEdge, RelationGraphNode, RelationGraphPayload } from "./projectModelGraphModel";
import { ProjectOverviewPanelModelGraph } from "./ProjectOverviewPanelModelGraph";
import { ProjectOverviewPanelModelSummary } from "./ProjectOverviewPanelModelSummary";
import type { ModelEntityCard, ModelRuleMapping } from "./projectModelBusinessView";
import type { UnifiedGraphData } from "../../domain/workspace/unifiedGraphTypes";
import { UnifiedGraphView } from "./UnifiedGraphView";
type RelationTypeFilter = "all" | "one_to_one" | "one_to_many" | "many_to_many";
type Props = {
  showModelDetails: boolean;
  setShowModelDetails: (updater: (prev: boolean) => boolean) => void;
  isUsingMockData: boolean;
  setBusinessSummaryVersion: (updater: (prev: number) => number) => void;
  businessSummaryLoading: boolean;
  modelDetailsView: "unified" | "summary" | "graph";
  setModelDetailsView: (view: "unified" | "summary" | "graph") => void;
  relationTypeFilter: RelationTypeFilter;
  setRelationTypeFilter: (value: RelationTypeFilter) => void;
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
  entityCards: ModelEntityCard[];
  ruleMappings: ModelRuleMapping[];
  relationNarratives: Array<{ id: string; title: string; meaning: string }>;
  displayedModelEntityCount: number;
  displayedModelRelations: ModelRelationPayload[];
  displayedModelRuleCount: number;
  unifiedGraph: UnifiedGraphData;
  knowledgeGenerating: boolean;
  onGenerateKnowledgeGraph: () => void;
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
  entityCards,
  ruleMappings,
  relationNarratives,
  displayedModelEntityCount, displayedModelRelations, displayedModelRuleCount,
  unifiedGraph, knowledgeGenerating, onGenerateKnowledgeGraph
}: Props) {
  const selectedEntityCard = selectedNode ? entityCards.find((item) => item.id === selectedNode.id) || null : null;
  const selectedRuleMappings = selectedNode
    ? ruleMappings.filter((item) => item.linkedEntities.some((entity) => entity === selectedEntityCard?.title || entity === selectedEntityCard?.technicalName))
    : [];
  return (
    <div className="info-box project-model-box">
      <div className="panel-head tight">
        <h3>项目全景图谱</h3>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => setShowModelDetails((prev) => !prev)}>
            {showModelDetails ? "收起详情" : "查看详情"}
          </button>
          {showModelDetails && !isUsingMockData ? (
            <button type="button" className="btn ghost mini" onClick={() => setBusinessSummaryVersion((prev) => prev + 1)}>
              刷新摘要
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
              className={`btn ghost mini ${modelDetailsView === "unified" ? "active" : ""}`}
              role="tab"
              aria-selected={modelDetailsView === "unified"}
              onClick={() => setModelDetailsView("unified")}
            >
              全景图谱
            </button>
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
              关系明细
            </button>
          </div>
          {modelDetailsView === "unified" ? (
            <UnifiedGraphView
              data={unifiedGraph}
              generating={knowledgeGenerating}
              onGenerate={onGenerateKnowledgeGraph}
            />
          ) : modelDetailsView === "summary" ? (
            <ProjectOverviewPanelModelSummary
              relationTypeStats={relationTypeStats}
              relationFocusEntities={relationFocusEntities}
              businessSummary={businessSummary}
              summaryGeneratedAtText={summaryGeneratedAtText}
              businessSummaryLoading={businessSummaryLoading}
              businessSummaryError={businessSummaryError}
              domainRuleDescriptions={domainRuleDescriptions}
              entityCards={entityCards}
              ruleMappings={ruleMappings}
              relationNarratives={relationNarratives}
              displayedModelEntityCount={displayedModelEntityCount}
              displayedModelRelationsCount={displayedModelRelations.length}
              displayedModelRuleCount={displayedModelRuleCount}
            />
          ) : (
            <ProjectOverviewPanelModelGraph
              relationTypeFilter={relationTypeFilter}
              setRelationTypeFilter={setRelationTypeFilter}
              relationGraph={relationGraph}
              relationGraphNodeById={relationGraphNodeById}
              filteredRelationGraphEdges={filteredRelationGraphEdges}
              highlightedEdgeId={highlightedEdgeId}
              setHighlightedEdgeId={setHighlightedEdgeId}
              activeFocusNodeId={activeFocusNodeId}
              hoveredConnectedNodeIds={hoveredConnectedNodeIds}
              selectedNodeId={selectedNodeId}
              setSelectedNodeId={setSelectedNodeId}
              setHoveredNodeId={setHoveredNodeId}
              graphViewportOffset={graphViewportOffset}
              showNodeLabels={showNodeLabels}
              centerGraphOnPoint={centerGraphOnPoint}
              highlightedEdge={highlightedEdge}
              hoveredNodeId={hoveredNodeId}
              selectedNode={selectedNode}
              selectedNodeOutgoingEdges={selectedNodeOutgoingEdges}
              selectedNodeIncomingEdges={selectedNodeIncomingEdges}
              selectedEntityCard={selectedEntityCard}
              selectedRuleMappings={selectedRuleMappings}
              displayedModelEntityCount={displayedModelEntityCount}
              displayedModelRelations={displayedModelRelations}
            />
          )}
        </>
      )}
    </div>
  );
}
