export type KnowledgeGraphNodeType = "concept" | "entity" | "pattern" | "rule";
export type KnowledgeGraphRelation = "depends_on" | "extends" | "contradicts" | "related";

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  type: KnowledgeGraphNodeType;
  entryIds: number[];
  x: number;
  y: number;
};

export type KnowledgeGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: KnowledgeGraphRelation;
  label: string;
};

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  summary: string;
  insights: string[];
  maxDegree: number;
};

export type KnowledgeGraphCache = {
  projectId: number;
  graphData: KnowledgeGraphData;
  entryCount: number;
  generatedAt: string;
};
