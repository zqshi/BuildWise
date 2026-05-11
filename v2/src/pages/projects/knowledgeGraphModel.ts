import type { KnowledgeGraphData, KnowledgeGraphNode, KnowledgeGraphEdge } from "../../domain/workspace/knowledgeGraphTypes";

export type KnowledgeGraphLayout = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  maxDegree: number;
  nodeById: Map<string, KnowledgeGraphNode>;
};

export function buildKnowledgeGraphLayout(data: KnowledgeGraphData): KnowledgeGraphLayout {
  const nodeById = new Map<string, KnowledgeGraphNode>();
  for (const node of data.nodes) nodeById.set(node.id, node);
  return { nodes: data.nodes, edges: data.edges, maxDegree: data.maxDegree, nodeById };
}

export function getConnectedNodeIds(edges: KnowledgeGraphEdge[], nodeId: string): Set<string> {
  const connected = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) connected.add(edge.to);
    if (edge.to === nodeId) connected.add(edge.from);
  }
  connected.add(nodeId);
  return connected;
}

const RELATION_LABELS: Record<string, string> = {
  depends_on: "依赖",
  extends: "扩展",
  contradicts: "矛盾",
  related: "相关",
};

export function friendlyRelation(relation: string): string {
  return RELATION_LABELS[relation] || relation;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  concept: "概念",
  entity: "实体",
  pattern: "模式",
  rule: "规则",
};

export function friendlyNodeType(type: string): string {
  return NODE_TYPE_LABELS[type] || type;
}
