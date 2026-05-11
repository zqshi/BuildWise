export type KnowledgeCategory =
  | "technical"
  | "business-rule"
  | "pitfall"
  | "architecture-decision"
  | "customer-experience";

export type KnowledgeStatus = "draft" | "published" | "archived";
export type KnowledgeSource = "manual" | "analysis" | "coach" | "iteration-review";

export type KnowledgeEntry = {
  id: number;
  projectId: number;
  iterationId: number | null;
  title: string;
  category: KnowledgeCategory;
  groupName: string;
  content: string;
  applicableScene: string;
  tags: string[];
  source: KnowledgeSource;
  sourceRef: string;
  status: KnowledgeStatus;
  createdBy: string;
  reviewedBy: string;
  createdAt: string;
  updatedAt: string;
};
