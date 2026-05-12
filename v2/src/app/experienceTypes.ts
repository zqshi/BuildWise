export type ExperienceTriggerEvent =
  | "stage-gate-passed"
  | "iteration-completed"
  | "analysis-report-ready"
  | "coach-session-ended"
  | "change-approved"
  | "release-published";

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
  extractCategories: string[];
  autoPublish: boolean;
  minConfidence: number;
};

export type ExperiencePolicy = {
  id: number;
  scope: "platform" | "project";
  projectId: number;
  version: number;
  status: "draft" | "active";
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

export type ExperienceSearchResult = {
  entry: {
    id: number;
    projectId: number;
    title: string;
    category: string;
    content: string;
    applicableScene: string;
    tags: string[];
    source: string;
    status: string;
    experienceScope?: string;
    confidence?: number;
  };
  projectId: number;
  projectName: string;
  relevanceScore: number;
  matchReason: string;
};

export type CrossProjectInsight = {
  dimension: string;
  title: string;
  finding: string;
  recommendation: string;
  affectedProjects: string[];
};

export type CrossProjectInsightsReport = {
  insights: CrossProjectInsight[];
  generatedAt: string;
  projectCount: number;
  totalExperienceEntries: number;
};
