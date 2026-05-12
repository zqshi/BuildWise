export type UnifiedNodeSource = "model" | "knowledge" | "both";

export type UnifiedGraphNode = {
  id: string;
  label: string;
  source: UnifiedNodeSource;
  modelEntityId?: string;
  fieldCount?: number;
  knowledgeNodeType?: "concept" | "entity" | "pattern" | "rule";
  knowledgeEntryIds?: number[];
  degree: number;
  x: number;
  y: number;
};

export type UnifiedEdgeSource = "model" | "knowledge";

export type UnifiedGraphEdge = {
  id: string;
  from: string;
  to: string;
  source: UnifiedEdgeSource;
  relationType?: "one_to_one" | "one_to_many" | "many_to_many";
  businessMeaning?: string;
  semanticRelation?: "depends_on" | "extends" | "contradicts" | "related";
  label: string;
};

export type UnifiedGraphData = {
  nodes: UnifiedGraphNode[];
  edges: UnifiedGraphEdge[];
  maxDegree: number;
  knowledgeSummary: string;
  knowledgeInsights: string[];
  knowledgeGeneratedAt: string | null;
  modelNodeCount: number;
  knowledgeNodeCount: number;
  mergedNodeCount: number;
  truncated: boolean;
  hiddenNodeCount: number;
};
