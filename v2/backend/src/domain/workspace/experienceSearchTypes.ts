import type { KnowledgeEntry } from "./knowledgeTypes";

export type ExperienceSearchResult = {
  entry: KnowledgeEntry;
  projectId: number;
  projectName: string;
  relevanceScore: number;
  matchReason: string;
};

export type CrossProjectInsightDimension =
  | "completion-rate"
  | "quality-trend"
  | "risk-pattern"
  | "knowledge-coverage";

export type CrossProjectInsight = {
  dimension: CrossProjectInsightDimension;
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
