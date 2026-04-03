type ProjectKnowledgeShardType =
  | "project-summary"
  | "business-ontology"
  | "technical-ontology"
  | "decisions"
  | "release-history"
  | "daily-summary";

export type ProjectKnowledgeShard = {
  id: string;
  type: ProjectKnowledgeShardType;
  title: string;
  content: string;
  tags: string[];
  source: string;
  updatedAt: string;
};

export type ProjectWorkspaceSyncResult = {
  projectId: number;
  workspacePath: string;
  documentsWritten: string[];
  shardCount: number;
  syncedAt: string;
};

export type ProjectKnowledgeSearchResult = {
  id: string;
  title: string;
  type: ProjectKnowledgeShardType;
  content: string;
  score: number;
  tags: string[];
};
