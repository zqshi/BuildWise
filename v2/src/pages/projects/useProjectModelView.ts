import { useEffect, useMemo, useState } from "react";
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

export function useProjectModelView({
  currentProject,
  currentIteration,
  modelPageCount,
  modelRuleCount,
  modelEntityCount,
  modelRelations,
  projectProgress,
  repoHealth,
  status,
  recentIterations
}: UseProjectModelViewParams) {
  const [showModelDetails, setShowModelDetails] = useState(false);
  const [projectModelView, setProjectModelView] = useState<ProjectModelViewPayload | null>(null);
  const [businessSummaryVersion, setBusinessSummaryVersion] = useState(0);
  const [modelDetailsView, setModelDetailsView] = useState<"summary" | "graph">("summary");
  const [relationTypeFilter, setRelationTypeFilter] = useState<"all" | "one_to_one" | "one_to_many" | "many_to_many">("all");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const [graphViewportOffset, setGraphViewportOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset projectModelView on project change (handled via the main reset effect in the component,
  // but we also need to reset when project changes here)
  const resetProjectModelView = () => setProjectModelView(null);

  // Load project model view
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
      .catch(() => {
        if (!cancelled) {
          setProjectModelView(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, currentIteration?.id]);

  // Reset graph interaction state when filter changes
  useEffect(() => {
    setHoveredNodeId(null);
    setSelectedNodeId(null);
    setHighlightedEdgeId(null);
    setGraphViewportOffset({ x: 0, y: 0 });
  }, [relationTypeFilter]);

  // Auto-dismiss highlighted edge
  useEffect(() => {
    if (!highlightedEdgeId) return;
    const timer = window.setTimeout(() => {
      setHighlightedEdgeId((current) => (current === highlightedEdgeId ? null : current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [highlightedEdgeId]);

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

  const healthScore = useMemo(
    () =>
      computeProjectOverviewHealthScore({
        projectProgress,
        modelRuleCount: displayedModelRuleCount,
        modelEntityCount: displayedModelEntityCount,
        modelRelationCount: displayedModelRelations.length,
        modelPageCount: displayedModelPageCount,
        repoHealth,
        runtimeStatus: status?.status || ""
      }),
    [displayedModelEntityCount, displayedModelPageCount, displayedModelRelations.length, displayedModelRuleCount, projectProgress, repoHealth, status?.status]
  );

  const trendText = useMemo(() => {
    if (recentIterations.length < 2) {
      return "样本不足，趋势待形成";
    }
    const first = recentIterations[0]?.progress ?? 0;
    const last = recentIterations[recentIterations.length - 1]?.progress ?? 0;
    if (last > first) {
      return "跨迭代沉淀趋势向好";
    }
    if (last < first) {
      return "跨迭代沉淀趋势放缓";
    }
    return "跨迭代沉淀趋势平稳";
  }, [recentIterations]);

  const isUsingMockData = false;

  const relationTypeStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const item of displayedModelRelations) {
      const key = toFriendlyRelationType(item.type);
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
    return Array.from(stats.entries()).map(([name, count]) => ({ name, count }));
  }, [displayedModelRelations]);

  const modelSummaryText = useMemo(() => {
    const relationBrief = relationTypeStats.length > 0 ? relationTypeStats.map((item) => `${item.name}${item.count}条`).join("，") : "暂无关系类型沉淀";
    return `当前已沉淀领域规则 ${displayedModelRuleCount} 条、数据实体 ${displayedModelEntityCount} 个、实体关系 ${displayedModelRelations.length} 条；关系结构以${relationBrief}为主。`;
  }, [displayedModelEntityCount, displayedModelRelations.length, displayedModelRuleCount, relationTypeStats]);

  const relationFocusEntities = useMemo(() => {
    const entityCounter = new Map<string, number>();
    for (const relation of displayedModelRelations) {
      entityCounter.set(relation.fromEntityId, (entityCounter.get(relation.fromEntityId) ?? 0) + 1);
      entityCounter.set(relation.toEntityId, (entityCounter.get(relation.toEntityId) ?? 0) + 1);
    }
    return Array.from(entityCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([entityId, count]) => `${toFriendlyName(entityId)}(${count})`);
  }, [displayedModelRelations]);

  const businessSummary = useMemo(
    () =>
      currentProject && !isUsingMockData
        ? buildProjectModelBusinessSummaryFromView({
            projectId: currentProject.id,
            iterationId: currentIteration?.id ?? null,
            view: projectModelView,
            generatedAt: new Date(Date.now() + businessSummaryVersion).toISOString()
          })
        : null,
    [businessSummaryVersion, currentIteration?.id, currentProject, isUsingMockData, projectModelView]
  );

  const summaryGeneratedAtText = businessSummary?.generatedAt ? new Date(businessSummary.generatedAt).toLocaleString("zh-CN") : "";

  const domainRuleDescriptions = useMemo(() => {
    const lines: string[] = [];
    for (const item of displayedModelRelations.slice(0, 4)) {
      const from = toFriendlyName(item.fromEntityId);
      const to = toFriendlyName(item.toEntityId);
      const relation = toFriendlyRelationType(item.type);
      lines.push(`规则：${from}与${to}之间建立${relation}约束。`);
    }
    for (const item of ruleMappings.slice(0, 4)) {
      lines.push(`规则：${item.name}；映射对象：${item.linkedEntities.join("、") || "待补充实体映射"}`);
    }
    return lines;
  }, [displayedModelRelations, ruleMappings]);

  const modelHighlights = useMemo(() => {
    const issues: string[] = [];
    if (displayedModelEntityCount === 0) issues.push("尚未沉淀数据实体");
    if (displayedModelRuleCount === 0) issues.push("尚未沉淀领域规则");
    if (displayedModelRelations.length === 0) issues.push("尚未沉淀实体关系");
    return issues;
  }, [displayedModelEntityCount, displayedModelRuleCount, displayedModelRelations.length]);

  const summaryHeadline = businessSummary?.summary?.trim() || modelSummaryText;

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

  const showNodeLabels = relationGraph.nodes.length <= 20;

  const centerGraphOnPoint = (x: number, y: number) => {
    const clampOffset = (value: number) => Math.max(-18, Math.min(18, value));
    setGraphViewportOffset({
      x: clampOffset(50 - x),
      y: clampOffset(50 - y)
    });
  };

  const summaryHighlights = useMemo(() => {
    const items: string[] = [];
    if (businessSummary?.focus?.length) {
      items.push(...businessSummary.focus.slice(0, 2).map((item) => normalizeInlineMarkdownText(item)));
    } else if (relationTypeStats.length > 0) {
      items.push(`关系结构：${relationTypeStats.slice(0, 3).map((item) => `${item.name}${item.count}条`).join("、")}`);
    }
    if (relationFocusEntities.length > 0) {
      items.push(`关键实体：${relationFocusEntities.join("、")}`);
    }
    if (businessSummary?.risks?.length) {
      items.push(`风险提示：${normalizeInlineMarkdownText(businessSummary.risks[0])}`);
    } else if (modelHighlights.length > 0) {
      items.push(modelHighlights[0]);
    }
    items.push(`迭代趋势：${trendText}`);
    return items.slice(0, 4);
  }, [businessSummary?.focus, businessSummary?.risks, modelHighlights, relationFocusEntities, relationTypeStats, trendText]);

  return {
    showModelDetails,
    setShowModelDetails,
    projectModelView,
    resetProjectModelView,
    businessSummaryVersion,
    setBusinessSummaryVersion,
    modelDetailsView,
    setModelDetailsView,
    relationTypeFilter,
    setRelationTypeFilter,
    hoveredNodeId,
    setHoveredNodeId,
    selectedNodeId,
    setSelectedNodeId,
    highlightedEdgeId,
    setHighlightedEdgeId,
    graphViewportOffset,
    displayedModelRelations,
    displayedModelRuleCount,
    displayedModelEntityCount,
    displayedModelPageCount,
    entityCards,
    ruleMappings,
    relationNarratives,
    healthScore,
    trendText,
    isUsingMockData,
    relationTypeStats,
    modelSummaryText,
    relationFocusEntities,
    businessSummary,
    summaryGeneratedAtText,
    domainRuleDescriptions,
    modelHighlights,
    summaryHeadline,
    relationGraph,
    relationGraphNodeById,
    filteredRelationGraphEdges,
    highlightedEdge,
    activeFocusNodeId,
    selectedNode,
    selectedNodeOutgoingEdges,
    selectedNodeIncomingEdges,
    hoveredConnectedNodeIds,
    showNodeLabels,
    centerGraphOnPoint,
    summaryHighlights
  };
}
