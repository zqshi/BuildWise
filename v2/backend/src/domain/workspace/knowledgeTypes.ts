export type KnowledgeCategory =
  | "technical"
  | "business-rule"
  | "pitfall"
  | "architecture-decision"
  | "customer-experience";

export type KnowledgeStatus = "draft" | "published" | "archived";
export type KnowledgeSource = "manual" | "analysis" | "coach" | "iteration-review";

export const ALLOWED_KNOWLEDGE_CATEGORIES: ReadonlySet<string> = new Set<KnowledgeCategory>([
  "technical", "business-rule", "pitfall", "architecture-decision", "customer-experience"
]);

export const ALLOWED_KNOWLEDGE_STATUSES: ReadonlySet<string> = new Set<KnowledgeStatus>([
  "draft", "published", "archived"
]);

export const ALLOWED_KNOWLEDGE_SOURCES: ReadonlySet<string> = new Set<KnowledgeSource>([
  "manual", "analysis", "coach", "iteration-review"
]);

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

export type CreateKnowledgeEntryInput = Pick<KnowledgeEntry, "title" | "content" | "category"> & {
  groupName?: string;
  applicableScene?: string;
  tags?: string[];
  source?: KnowledgeSource;
  sourceRef?: string;
  iterationId?: number | null;
};

export type KnowledgeEntryFilter = {
  category?: KnowledgeCategory;
  status?: KnowledgeStatus;
  source?: KnowledgeSource;
  q?: string;
};
