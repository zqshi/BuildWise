export type BacklogItemPriority = "critical" | "high" | "medium" | "low";
export type BacklogItemStatus = "open" | "planned" | "in-progress" | "done" | "cancelled";
export type BacklogItemSource = "customer" | "internal" | "analysis" | "coach";

export const ALLOWED_BACKLOG_PRIORITIES: ReadonlySet<string> = new Set<BacklogItemPriority>([
  "critical", "high", "medium", "low"
]);

export const ALLOWED_BACKLOG_STATUSES: ReadonlySet<string> = new Set<BacklogItemStatus>([
  "open", "planned", "in-progress", "done", "cancelled"
]);

export const ALLOWED_BACKLOG_SOURCES: ReadonlySet<string> = new Set<BacklogItemSource>([
  "customer", "internal", "analysis", "coach"
]);

export type BacklogItem = {
  id: number;
  projectId: number;
  iterationId: number | null;
  title: string;
  description: string;
  priority: BacklogItemPriority;
  status: BacklogItemStatus;
  source: BacklogItemSource;
  sourceRef: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateBacklogItemInput = Pick<BacklogItem, "title"> & {
  description?: string;
  priority?: BacklogItemPriority;
  source?: BacklogItemSource;
  sourceRef?: string;
  tags?: string[];
  iterationId?: number | null;
};

export type BacklogItemFilter = {
  status?: BacklogItemStatus;
  priority?: BacklogItemPriority;
  source?: BacklogItemSource;
  iterationId?: number | null;
};
