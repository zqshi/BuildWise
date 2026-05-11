export type BacklogItemPriority = "critical" | "high" | "medium" | "low";
export type BacklogItemStatus = "open" | "planned" | "in-progress" | "done" | "cancelled";
export type BacklogItemSource = "customer" | "internal" | "analysis" | "coach";

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
