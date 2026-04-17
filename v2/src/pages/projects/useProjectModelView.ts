import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import type { Iteration, Project, ProjectModelViewPayload } from "../../domain/workspace/types";
import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import { fetchProjectModelView } from "../../app/workspaceApi";
import { buildModelRelationGraph } from "./projectModelGraphModel";
import {
  computeProjectOverviewHealthScore,
  buildProjectModelBusinessSummaryFromView,
  normalizeInlineMarkdownText,
  toFriendlyName,
  toFriendlyRelationType
} from "./projectOverviewPanelHelpers";
import { buildModelEntityCards, buildModelRelationNarratives, buildModelRuleMappings } from "./projectModelBusinessView";
import { toModelRelationsFromView } from "./projectModelViewAdapter";
import { normalizeProjectModelViewPayload } from "../../app/projectModelViewNormalization.ts";
import type { RepoHealthState } from "./useRepositoryConfig";
import type { StatusPayload } from "../../domain/workspace/types";

type UseProjectModelViewParams = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  modelPageCount: number;
  modelRuleCount: number;
  modelEntityCount: number;
  modelRelations: ModelRelationPayload[];
  projectProgress: number;
  repoHealth: RepoHealthState;
  status: StatusPayload | null;
  recentIterations: Iteration[];
};

function useModelViewState() {
  const [showModelDetails, setShowModelDetails] = useState(false);
  const [projectModelView, setProjectModelView] = useState<ProjectModelViewPayload | null>(null);
  const [businessSummaryVersion, setBusinessSummaryVersion] = useState(0);
  const [modelDetailsView, setModelDetailsView] = useState<"summary" | "graph">("summary");
  const [relationTypeFilter, setRelationTypeFilter] = useState<"all" | "one_to_one" | "one_to_many" | "many_to_many">("all");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const [graphViewportOffset, setGraphViewportOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetProjectModelView = () => setProjectModelView(null);

  return {
    showModelDetails, setShowModelDetails,
    projectModelView, setProjectModelView, resetProjectModelView,
    businessSummaryVersion, setBusinessSummaryVersion,
    modelDetailsView, setModelDetailsView,
    relationTypeFilter, setRelationTypeFilter,
    hoveredNodeId, setHoveredNodeId,
    selectedNodeId, setSelectedNodeId,
    highlightedEdgeId, setHighlightedEdgeId,
    graphViewportOffset, setGraphViewportOffset,
  };
}

function useModelViewEffects(
  currentProject: Project | null,
  currentIteration: Iteration | null,
  relationTypeFilter: string,
  highlightedEdgeId: string | null,
  setProjectModelView: (v: ProjectModelViewPayload | null) => void,
  setHoveredNodeId: (v: string | null) => void,
  setSelectedNodeId: (v: string | null) => void,
  setHighlightedEdgeId: Dispatch<SetStateAction<string | null>>,
  setGraphViewportOffset: (v: { x: number; y: number }) => void
) {
  useEffect(() => {
    let cancelled = false;
    if (!currentProject) {
      setProjectModelView(null);
      return;
    }
    fetchProjectModelView(currentProject.id, currentIteration?.id)
      .then((view) => {
        if (!cancelled) {
          setProjectModelView(normalizeProjectModelViewPayload(view));
        }
      })
      .catch((err) => {
        console.debug("[useProjectModelView] 加载失败", err);
        if (!cancelled) {
          setProjectModelView(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, currentIteration?.id]);

  useEffect(() => {
    setHoveredNodeId(null);
    setSelectedNodeId(null);
    setHighlightedEdgeId(null);
    setGraphViewportOffset({ x: 0, y: 0 });
  }, [relationTypeFilter]);

  useEffect(() => {
    if (!highlightedEdgeId) return;
    const timer = window.setTimeout(() => {
      setHighlightedEdgeId((current) => (current === highlightedEdgeId ? null : current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [highlightedEdgeId]);
}

function useModelDisplayData(
  projectModelView: ProjectModelViewPayload | null,
  modelRelations: ModelRelationPayload[],
  modelRuleCount: number,
  modelEntityCount: number,
  modelPageCount: number
) {
  const displayedModelRelations = useMemo(
    () => (projectModelView ? toModelRelationsFromView(projectModelView) : modelRelations),
    [modelRelations, projectModelView]
  );
  const displayedModelRuleCount = projectModelView?.rules.length ?? modelRuleCount;
  const displayedModelEntityCount = projectModelView?.entities.length ?? modelEntityCount;
  const displayedModelPageCount =
    projectModelView
      ? Array.from(new Set(projectModelView.rules.flatMap((item) => item.linkedSurfaceIds || []))).length || modelPageCount
      : modelPageCount;

  const entityCards = useMemo(() => buildModelEntityCards(projectModelView), [projectModelView]);
  const ruleMappings = useMemo(() => buildModelRuleMappings(projectModelView), [projectModelView]);
  const relationNarratives = useMemo(() => buildModelRelationNarratives(projectModelView), [projectModelView]);

  return {
    displayedModelRelations,
    displayedModelRuleCount,
    displayedModelEntityCount,
    displayedModelPageCount,
    entityCards,
    ruleMappings,
    relationNarratives,
  };
}

function useModelGraphBase(
  displayedModelRelations: ModelRelationPayload[],
  displayedModelEntityCount: number,
  projectModelView: ProjectModelViewPayload | null,
  relationTypeFilter: "all" | "one_to_one" | "one_to_many" | "many_to_many"
) {
  const relationGraph = useMemo(
    () => buildModelRelationGraph(displayedModelRelations, displayedModelEntityCount, 80, projectModelView?.entities),
    [displayedModelEntityCount, displayedModelRelations, projectModelView?.entities]
  );

  const relationGraphNodeById = useMemo(
    () => new Map(relationGraph.nodes.map((node) => [node.id, node])),
    [relationGraph.nodes]
  );

  const filteredRelationGraphEdges = useMemo(
    () =>
      relationGraph.edges.filter((edge) => {
        if (relationTypeFilter === "all") return true;
        return edge.type === relationTypeFilter;
      }),
    [relationGraph.edges, relationTypeFilter]
  );

  const filteredRelationGraphEdgeById = useMemo(
    () => new Map(filteredRelationGraphEdges.map((edge) => [edge.id, edge])),
    [filteredRelationGraphEdges]
  );

  const showNodeLabels = relationGraph.nodes.length <= 20;

  return { relationGraph, relationGraphNodeById, filteredRelationGraphEdges, filteredRelationGraphEdgeById, showNodeLabels };
}

function useModelGraphInteraction(
  filteredRelationGraphEdges: ReturnType<typeof useModelGraphBase>["filteredRelationGraphEdges"],
  filteredRelationGraphEdgeById: ReturnType<typeof useModelGraphBase>["filteredRelationGraphEdgeById"],
  relationGraphNodeById: ReturnType<typeof useModelGraphBase>["relationGraphNodeById"],
  hoveredNodeId: string | null,
  selectedNodeId: string | null,
  highlightedEdgeId: string | null
) {
  const highlightedEdge = highlightedEdgeId ? filteredRelationGraphEdgeById.get(highlightedEdgeId) ?? null : null;
  const activeFocusNodeId = hoveredNodeId ?? selectedNodeId;
  const selectedNode = selectedNodeId ? relationGraphNodeById.get(selectedNodeId) ?? null : null;

  const selectedNodeOutgoingEdges = useMemo(
    () => (selectedNodeId ? filteredRelationGraphEdges.filter((edge) => edge.fromEntityId === selectedNodeId) : []),
    [filteredRelationGraphEdges, selectedNodeId]
  );

  const selectedNodeIncomingEdges = useMemo(
    () => (selectedNodeId ? filteredRelationGraphEdges.filter((edge) => edge.toEntityId === selectedNodeId) : []),
    [filteredRelationGraphEdges, selectedNodeId]
  );

  const hoveredConnectedNodeIds = useMemo(() => {
    if (!activeFocusNodeId) return null;
    const ids = new Set<string>([activeFocusNodeId]);
    for (const edge of filteredRelationGraphEdges) {
      if (edge.fromEntityId === activeFocusNodeId) ids.add(edge.toEntityId);
      if (edge.toEntityId === activeFocusNodeId) ids.add(edge.fromEntityId);
    }
    return ids;
  }, [activeFocusNodeId, filteredRelationGraphEdges]);

  return { highlightedEdge, activeFocusNodeId, selectedNode, selectedNodeOutgoingEdges, selectedNodeIncomingEdges, hoveredConnectedNodeIds };
}

type ModelStatsInput = {
  displayedModelRelations: ModelRelationPayload[];
  displayedModelRuleCount: number;
  displayedModelEntityCount: number;
  displayedModelPageCount: number;
  projectProgress: number;
  repoHealth: RepoHealthState;
  status: StatusPayload | null;
  recentIterations: Iteration[];
};

function computeRelationFocusEntities(relations: ModelRelationPayload[]): string[] {
  const entityCounter = new Map<string, number>();
  for (const relation of relations) {
    entityCounter.set(relation.fromEntityId, (entityCounter.get(relation.fromEntityId) ?? 0) + 1);
    entityCounter.set(relation.toEntityId, (entityCounter.get(relation.toEntityId) ?? 0) + 1);
  }
  return Array.from(entityCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([entityId, count]) => `${toFriendlyName(entityId)}(${count})`);
}

function useModelStats(p: ModelStatsInput) {
  const healthScore = useMemo(
    () =>
      computeProjectOverviewHealthScore({
        projectProgress: p.projectProgress,
        modelRuleCount: p.displayedModelRuleCount,
        modelEntityCount: p.displayedModelEntityCount,
        modelRelationCount: p.displayedModelRelations.length,
        modelPageCount: p.displayedModelPageCount,
        repoHealth: p.repoHealth,
        runtimeStatus: p.status?.status || ""
      }),
    [p.displayedModelEntityCount, p.displayedModelPageCount, p.displayedModelRelations.length, p.displayedModelRuleCount, p.projectProgress, p.repoHealth, p.status?.status]
  );

  const trendText = useMemo(() => {
    if (p.recentIterations.length < 2) return "样本不足，趋势待形成";
    const first = p.recentIterations[0]?.progress ?? 0;
    const last = p.recentIterations[p.recentIterations.length - 1]?.progress ?? 0;
    if (last > first) return "跨迭代沉淀趋势向好";
    if (last < first) return "跨迭代沉淀趋势放缓";
    return "跨迭代沉淀趋势平稳";
  }, [p.recentIterations]);

  const isUsingMockData = false;

  const relationTypeStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const item of p.displayedModelRelations) {
      const key = toFriendlyRelationType(item.type);
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
    return Array.from(stats.entries()).map(([name, count]) => ({ name, count }));
  }, [p.displayedModelRelations]);

  const modelSummaryText = useMemo(() => {
    const relationBrief = relationTypeStats.length > 0 ? relationTypeStats.map((item) => `${item.name}${item.count}条`).join("，") : "暂无关系类型沉淀";
    return `当前已沉淀领域规则 ${p.displayedModelRuleCount} 条、数据实体 ${p.displayedModelEntityCount} 个、实体关系 ${p.displayedModelRelations.length} 条；关系结构以${relationBrief}为主。`;
  }, [p.displayedModelEntityCount, p.displayedModelRelations.length, p.displayedModelRuleCount, relationTypeStats]);

  const relationFocusEntities = useMemo(
    () => computeRelationFocusEntities(p.displayedModelRelations),
    [p.displayedModelRelations]
  );

  return { healthScore, trendText, isUsingMockData, relationTypeStats, modelSummaryText, relationFocusEntities };
}

type SummaryAssemblyInput = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  projectModelView: ProjectModelViewPayload | null;
  businessSummaryVersion: number;
  displayedModelRelations: ModelRelationPayload[];
  displayedModelRuleCount: number;
  displayedModelEntityCount: number;
  ruleMappings: { name: string; linkedEntities: string[] }[];
  stats: ReturnType<typeof useModelStats>;
};

function useModelSummaryAssembly(p: SummaryAssemblyInput) {
  const { isUsingMockData, relationTypeStats, modelSummaryText, relationFocusEntities, trendText } = p.stats;
  const businessSummary = useMemo(
    () =>
      p.currentProject && !isUsingMockData
        ? buildProjectModelBusinessSummaryFromView({
            projectId: p.currentProject.id,
            iterationId: p.currentIteration?.id ?? null,
            view: p.projectModelView,
            generatedAt: new Date(Date.now() + p.businessSummaryVersion).toISOString()
          })
        : null,
    [p.businessSummaryVersion, p.currentIteration?.id, p.currentProject, isUsingMockData, p.projectModelView]
  );
  const summaryGeneratedAtText = businessSummary?.generatedAt ? new Date(businessSummary.generatedAt).toLocaleString("zh-CN") : "";
  const domainRuleDescriptions = useMemo(() => {
    const lines: string[] = [];
    for (const item of p.displayedModelRelations.slice(0, 4)) {
      const from = toFriendlyName(item.fromEntityId);
      const to = toFriendlyName(item.toEntityId);
      lines.push(`规则：${from}与${to}之间建立${toFriendlyRelationType(item.type)}约束。`);
    }
    for (const item of p.ruleMappings.slice(0, 4)) {
      lines.push(`规则：${item.name}；映射对象：${item.linkedEntities.join("、") || "待补充实体映射"}`);
    }
    return lines;
  }, [p.displayedModelRelations, p.ruleMappings]);
  const modelHighlights = useMemo(() => {
    const issues: string[] = [];
    if (p.displayedModelEntityCount === 0) issues.push("尚未沉淀数据实体");
    if (p.displayedModelRuleCount === 0) issues.push("尚未沉淀领域规则");
    if (p.displayedModelRelations.length === 0) issues.push("尚未沉淀实体关系");
    return issues;
  }, [p.displayedModelEntityCount, p.displayedModelRuleCount, p.displayedModelRelations.length]);
  const summaryHeadline = businessSummary?.summary?.trim() || modelSummaryText;
  const summaryHighlights = useMemo(() => {
    const items: string[] = [];
    if (businessSummary?.focus?.length) {
      items.push(...businessSummary.focus.slice(0, 2).map((item) => normalizeInlineMarkdownText(item)));
    } else if (relationTypeStats.length > 0) {
      items.push(`关系结构：${relationTypeStats.slice(0, 3).map((item) => `${item.name}${item.count}条`).join("、")}`);
    }
    if (relationFocusEntities.length > 0) items.push(`关键实体：${relationFocusEntities.join("、")}`);
    if (businessSummary?.risks?.length) {
      items.push(`风险提示：${normalizeInlineMarkdownText(businessSummary.risks[0])}`);
    } else if (modelHighlights.length > 0) {
      items.push(modelHighlights[0]);
    }
    items.push(`迭代趋势：${trendText}`);
    return items.slice(0, 4);
  }, [businessSummary?.focus, businessSummary?.risks, modelHighlights, relationFocusEntities, relationTypeStats, trendText]);
  return { businessSummary, summaryGeneratedAtText, domainRuleDescriptions, modelHighlights, summaryHeadline, summaryHighlights };
}

export function useProjectModelView({
  currentProject, currentIteration, modelPageCount, modelRuleCount,
  modelEntityCount, modelRelations, projectProgress, repoHealth, status, recentIterations
}: UseProjectModelViewParams) {
  const state = useModelViewState();
  useModelViewEffects(
    currentProject, currentIteration,
    state.relationTypeFilter, state.highlightedEdgeId,
    state.setProjectModelView, state.setHoveredNodeId,
    state.setSelectedNodeId, state.setHighlightedEdgeId,
    state.setGraphViewportOffset
  );
  const display = useModelDisplayData(
    state.projectModelView, modelRelations, modelRuleCount, modelEntityCount, modelPageCount
  );
  const graphBase = useModelGraphBase(
    display.displayedModelRelations, display.displayedModelEntityCount,
    state.projectModelView, state.relationTypeFilter
  );
  const graphInteraction = useModelGraphInteraction(
    graphBase.filteredRelationGraphEdges, graphBase.filteredRelationGraphEdgeById,
    graphBase.relationGraphNodeById,
    state.hoveredNodeId, state.selectedNodeId, state.highlightedEdgeId
  );
  const stats = useModelStats({
    displayedModelRelations: display.displayedModelRelations,
    displayedModelRuleCount: display.displayedModelRuleCount,
    displayedModelEntityCount: display.displayedModelEntityCount,
    displayedModelPageCount: display.displayedModelPageCount,
    projectProgress, repoHealth, status, recentIterations,
  });
  const summaryAssembly = useModelSummaryAssembly({
    currentProject, currentIteration,
    projectModelView: state.projectModelView,
    businessSummaryVersion: state.businessSummaryVersion,
    displayedModelRelations: display.displayedModelRelations,
    displayedModelRuleCount: display.displayedModelRuleCount,
    displayedModelEntityCount: display.displayedModelEntityCount,
    ruleMappings: display.ruleMappings, stats,
  });
  const centerGraphOnPoint = (x: number, y: number) => {
    const clampOffset = (value: number) => Math.max(-18, Math.min(18, value));
    state.setGraphViewportOffset({ x: clampOffset(50 - x), y: clampOffset(50 - y) });
  };
  return {
    ...state, ...display, ...stats, ...summaryAssembly, ...graphBase, ...graphInteraction, centerGraphOnPoint,
  };
}
