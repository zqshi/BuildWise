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

export type DeploymentRecord = {
  id: number;
  projectId: number;
  environment: "staging" | "production";
  version: string;
  status: "queued" | "success" | "failed";
  createdAt: string;
};

export type OpsMetricsPayload = {
  generatedAt: string;
  metrics: Array<{ name: string; value: number; unit: string }>;
  latestAuditAt: string;
};
