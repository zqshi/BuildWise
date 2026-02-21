export type VersionSnapshot = {
  id: number;
  projectId: number;
  iterationId: number;
  name: string;
  note: string;
  status: string;
  progress: number;
  createdAt: string;
};

export type ProjectShare = {
  id: number;
  projectId: number;
  token: string;
  permission: "read" | "comment";
  expiresAt: string;
  createdAt: string;
};

export type TemplateItem = {
  id: string;
  name: string;
  category: string;
  description: string;
};

export type TemplateRunResult = {
  runId: string;
  templateId: string;
  projectId: number;
  status: string;
  startedAt: string;
  finishedAt: string;
  summary: string;
};

export type TemplateRunHistory = TemplateRunResult & {
  id: number;
  parameters: Record<string, string>;
};

export type DeploymentRecord = {
  id: number;
  projectId: number;
  iterationId?: number;
  environment: "staging" | "production";
  version: string;
  status: "queued" | "running" | "success" | "failed";
  createdAt: string;
};

export type OpsMetricsPayload = {
  generatedAt: string;
  metrics: Array<{ name: string; value: number; unit: string }>;
  latestAuditAt: string;
};

export type OpsTriageTemplate = {
  id: string;
  category: string;
  keywords: string[];
  commands: string[];
  note: string;
  source?: "system" | "custom";
  projectId?: number;
};

export type OpsTriageTemplatePayload = {
  generatedAt: string;
  templates: OpsTriageTemplate[];
};

export type ShareAccessPayload = {
  token: string;
  permission: "read" | "comment";
  expiresAt: string;
  project: {
    id: number;
    name: string;
    description: string;
  };
  iterationCount: number;
};
