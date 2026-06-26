import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes";
import type { KnowledgeGraphData } from "../../domain/workspace/knowledgeGraphTypes";
import type {
  UnifiedGraphNode,
  UnifiedGraphEdge,
  UnifiedGraphData,
} from "../../domain/workspace/unifiedGraphTypes";

const MAX_VISIBLE_NODES = 40;

function normalizeLabel(text: string): string {
  return text.trim().toLowerCase();
}

function circularPosition(index: number, total: number) {
  if (total <= 1) return { x: 50, y: 50 };
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = Math.min(40, Math.max(26, 44 - Math.log2(total + 1) * 4));
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
}

function buildMergedNodes(
  modelView: ProjectModelViewPayload | null,
  knowledgeGraph: KnowledgeGraphData | null
) {
  const nodes: UnifiedGraphNode[] = [];
  const labelToNodeId = new Map<string, string>();
  const knowledgeIdRemap = new Map<string, string>();
  let modelCount = 0;
  let knowledgeCount = 0;
  let mergedCount = 0;

  for (const entity of modelView?.entities ?? []) {
    const label = entity.businessName || entity.name;
    const id = `m-${entity.id}`;
    nodes.push({
      id, label, source: "model",
      modelEntityId: entity.id,
      fieldCount: entity.fields?.length ?? 0,
      degree: 0, x: 0, y: 0,
    });
    labelToNodeId.set(normalizeLabel(label), id);
    modelCount++;
  }

  for (const kNode of knowledgeGraph?.nodes ?? []) {
    const normalized = normalizeLabel(kNode.label);
    const existingId = labelToNodeId.get(normalized);
    if (existingId) {
      const existing = nodes.find((n) => n.id === existingId);
      if (existing) {
        existing.source = "both";
        existing.knowledgeNodeType = kNode.type;
        existing.knowledgeEntryIds = kNode.entryIds;
        mergedCount++;
      }
      knowledgeIdRemap.set(kNode.id, existingId);
    } else {
      const id = `k-${kNode.id}`;
      nodes.push({
        id, label: kNode.label, source: "knowledge",
        knowledgeNodeType: kNode.type,
        knowledgeEntryIds: kNode.entryIds,
        degree: 0, x: 0, y: 0,
      });
      labelToNodeId.set(normalized, id);
      knowledgeIdRemap.set(kNode.id, id);
      knowledgeCount++;
    }
  }

  return { nodes, knowledgeIdRemap, modelCount, knowledgeCount, mergedCount };
}

function buildMergedEdges(
  modelView: ProjectModelViewPayload | null,
  knowledgeGraph: KnowledgeGraphData | null,
  knowledgeIdRemap: Map<string, string>,
  nodeIdSet: Set<string>
): UnifiedGraphEdge[] {
  const edges: UnifiedGraphEdge[] = [];

  for (const rel of modelView?.relations ?? []) {
    const from = `m-${rel.fromEntityId}`;
    const to = `m-${rel.toEntityId}`;
    if (!nodeIdSet.has(from) || !nodeIdSet.has(to)) continue;
    edges.push({
      id: `me-${rel.id}`, from, to, source: "model",
      relationType: rel.type,
      businessMeaning: rel.businessMeaning,
      label: rel.businessMeaning || "",
    });
  }

  for (const kEdge of knowledgeGraph?.edges ?? []) {
    const from = knowledgeIdRemap.get(kEdge.from);
    const to = knowledgeIdRemap.get(kEdge.to);
    if (!from || !to || !nodeIdSet.has(from) || !nodeIdSet.has(to)) continue;
    edges.push({
      id: `ke-${kEdge.id}`, from, to, source: "knowledge",
      semanticRelation: kEdge.relation,
      label: kEdge.label,
    });
  }

  return edges;
}

function applyLayout(nodes: UnifiedGraphNode[], edges: UnifiedGraphEdge[]) {
  const degreeMap = new Map<string, number>();
  for (const edge of edges) {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  }

  const sorted = [...nodes].sort((a, b) => {
    const sourcePriority = { both: 0, model: 1, knowledge: 2 };
    const sp = sourcePriority[a.source] - sourcePriority[b.source];
    if (sp !== 0) return sp;
    return (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0);
  });

  const truncated = sorted.length > MAX_VISIBLE_NODES;
  const visible = sorted.slice(0, MAX_VISIBLE_NODES);
  const visibleIds = new Set(visible.map((n) => n.id));

  for (let i = 0; i < visible.length; i++) {
    const pos = circularPosition(i, visible.length);
    visible[i].x = pos.x;
    visible[i].y = pos.y;
    visible[i].degree = degreeMap.get(visible[i].id) ?? 0;
  }

  const visibleEdges = edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  const maxDegree = visible.reduce((max, n) => Math.max(max, n.degree), 0);

  return { nodes: visible, edges: visibleEdges, maxDegree, truncated, hiddenNodeCount: sorted.length - visible.length };
}

export function mergeToUnifiedGraph(
  modelView: ProjectModelViewPayload | null,
  knowledgeGraph: KnowledgeGraphData | null,
  knowledgeGeneratedAt: string | null,
  previousNodeIds?: Set<string>
): UnifiedGraphData {
  const { nodes, knowledgeIdRemap, modelCount, knowledgeCount, mergedCount } = buildMergedNodes(modelView, knowledgeGraph);
  // V4 本体 diff：标记上一版本不存在的新增节点
  if (previousNodeIds) {
    for (const node of nodes) {
      node.isNew = !previousNodeIds.has(node.id);
    }
  }
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges = buildMergedEdges(modelView, knowledgeGraph, knowledgeIdRemap, nodeIdSet);
  const layout = applyLayout(nodes, edges);

  return {
    ...layout,
    knowledgeSummary: knowledgeGraph?.summary ?? "",
    knowledgeInsights: knowledgeGraph?.insights ?? [],
    knowledgeGeneratedAt,
    modelNodeCount: modelCount,
    knowledgeNodeCount: knowledgeCount,
    mergedNodeCount: mergedCount,
  };
}

export function getUnifiedConnectedNodeIds(edges: UnifiedGraphEdge[], nodeId: string): Set<string> {
  const connected = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.from === nodeId) connected.add(edge.to);
    if (edge.to === nodeId) connected.add(edge.from);
  }
  return connected;
}

const SEMANTIC_LABELS: Record<string, string> = {
  depends_on: "依赖", extends: "扩展", contradicts: "矛盾", related: "相关",
};

const ER_LABELS: Record<string, string> = {
  one_to_one: "一对一", one_to_many: "一对多", many_to_many: "多对多",
};

const NODE_SOURCE_LABELS: Record<string, string> = {
  model: "领域实体", knowledge: "知识概念", both: "双来源",
};

export function friendlyEdgeLabel(edge: UnifiedGraphEdge): string {
  if (edge.source === "model" && edge.relationType) return ER_LABELS[edge.relationType] ?? edge.relationType;
  if (edge.source === "knowledge" && edge.semanticRelation) return SEMANTIC_LABELS[edge.semanticRelation] ?? edge.semanticRelation;
  return edge.label;
}

export function friendlyNodeSource(source: string): string {
  return NODE_SOURCE_LABELS[source] ?? source;
}
