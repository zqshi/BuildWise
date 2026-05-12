import type { KnowledgeCategory } from "./knowledgeTypes";

export type ExperienceTriggerEvent =
  | "stage-gate-passed"
  | "iteration-completed"
  | "analysis-report-ready"
  | "coach-session-ended"
  | "change-approved"
  | "release-published";

export const ALL_TRIGGER_EVENTS: readonly ExperienceTriggerEvent[] = [
  "stage-gate-passed",
  "iteration-completed",
  "analysis-report-ready",
  "coach-session-ended",
  "change-approved",
  "release-published"
];

export const TRIGGER_EVENT_LABELS: Record<ExperienceTriggerEvent, string> = {
  "stage-gate-passed": "阶段门禁通过",
  "iteration-completed": "迭代完成",
  "analysis-report-ready": "分析报告就绪",
  "coach-session-ended": "Coach 对话结束",
  "change-approved": "变更审批通过",
  "release-published": "发布完成"
};

export type ExperienceExtractionRule = {
  trigger: ExperienceTriggerEvent;
  enabled: boolean;
  extractCategories: KnowledgeCategory[];
  autoPublish: boolean;
  minConfidence: number;
};

export type ExperiencePolicyStatus = "draft" | "active";

export type ExperiencePolicy = {
  id: number;
  scope: "platform" | "project";
  projectId: number;
  version: number;
  status: ExperiencePolicyStatus;
  rules: ExperienceExtractionRule[];
  scheduleScanEnabled: boolean;
  scheduleScanIntervalDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ExperienceExtractionRecord = {
  id: number;
  projectId: number;
  iterationId: number | null;
  triggerEvent: ExperienceTriggerEvent;
  sourceStage: string;
  sourceDigest: string;
  extractedEntryIds: number[];
  status: "success" | "failed" | "skipped";
  errorMessage: string;
  createdAt: string;
};

export function buildDefaultExperiencePolicy(
  createdBy: string,
  overrides?: Partial<Pick<ExperiencePolicy, "scope" | "projectId">>
): Omit<ExperiencePolicy, "id"> {
  const now = new Date().toISOString();
  return {
    scope: overrides?.scope ?? "platform",
    projectId: overrides?.projectId ?? 0,
    version: 1,
    status: "active",
    rules: ALL_TRIGGER_EVENTS.map((trigger) => ({
      trigger,
      enabled: true,
      extractCategories: ["technical", "business-rule", "pitfall", "architecture-decision", "customer-experience"],
      autoPublish: false,
      minConfidence: 60
    })),
    scheduleScanEnabled: true,
    scheduleScanIntervalDays: 7,
    createdBy,
    createdAt: now,
    updatedAt: now
  };
}
