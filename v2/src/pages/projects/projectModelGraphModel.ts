import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";

export type RelationGraphNode = {
  id: string;
  label: string;
  degree: number;
  x: number;
  y: number;
};

export type RelationGraphEdge = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: ModelRelationPayload["type"];
  name?: string;
  businessDescription?: string;
  ontologyBasis?: string;
  dataBasis?: string[];
};

export type RelationGraphPayload = {
  nodes: RelationGraphNode[];
  edges: RelationGraphEdge[];
  truncated: boolean;
  hiddenNodeCount: number;
  unlinkedEntityCount: number;
  maxDegree: number;
};

function toFriendlyName(entityId: string) {
  return entityId.replace(/^entity_/i, "").replace(/[_-]+/g, " ").trim() || entityId;
}

function calculateCircularPosition(index: number, total: number) {
  if (total <= 1) {
    return { x: 50, y: 50 };
  }
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = Math.min(40, Math.max(26, 44 - Math.log2(total + 1) * 4));
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius
  };
}

export function buildModelRelationGraph(
  relations: ModelRelationPayload[],
  totalEntityCount: number,
  maxVisibleNodes = 80
): RelationGraphPayload {
  const degreeByEntity = new Map<string, number>();
  for (const relation of relations) {
    degreeByEntity.set(relation.fromEntityId, (degreeByEntity.get(relation.fromEntityId) ?? 0) + 1);
    degreeByEntity.set(relation.toEntityId, (degreeByEntity.get(relation.toEntityId) ?? 0) + 1);
  }

  const allEntityIds = Array.from(degreeByEntity.keys()).sort((left, right) => {
    const leftDegree = degreeByEntity.get(left) ?? 0;
    const rightDegree = degreeByEntity.get(right) ?? 0;
    if (leftDegree !== rightDegree) {
      return rightDegree - leftDegree;
    }
    return left.localeCompare(right);
  });

  const visibleEntityIds = allEntityIds.slice(0, Math.max(0, maxVisibleNodes));
  const visibleEntitySet = new Set(visibleEntityIds);
  const nodes = visibleEntityIds.map((entityId, index) => {
    const point = calculateCircularPosition(index, visibleEntityIds.length);
    return {
      id: entityId,
      label: toFriendlyName(entityId),
      degree: degreeByEntity.get(entityId) ?? 0,
      x: point.x,
      y: point.y
    };
  });

  const edges = relations
    .filter((relation) => visibleEntitySet.has(relation.fromEntityId) && visibleEntitySet.has(relation.toEntityId))
    .map((relation) => ({
      id: relation.id,
      fromEntityId: relation.fromEntityId,
      toEntityId: relation.toEntityId,
      type: relation.type,
      name: relation.name,
      businessDescription: relation.businessDescription,
      ontologyBasis: relation.ontologyBasis,
      dataBasis: relation.dataBasis
    }));

  const maxDegree = nodes.reduce((max, node) => Math.max(max, node.degree), 0);
  const unlinkedEntityCount = Math.max(0, totalEntityCount - allEntityIds.length);

  return {
    nodes,
    edges,
    truncated: allEntityIds.length > visibleEntityIds.length,
    hiddenNodeCount: Math.max(0, allEntityIds.length - visibleEntityIds.length),
    unlinkedEntityCount,
    maxDegree
  };
}
