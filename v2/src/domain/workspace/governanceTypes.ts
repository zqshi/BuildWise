export type GovernanceRole = {
  id: "owner" | "pm" | "developer" | "qa" | "viewer";
  name: string;
  permissions: string[];
};

export type GovernancePermissionPoint = {
  key: string;
  title: string;
  module: string;
  sourceType: "page" | "api";
  source: string;
};

export type AuditLog = {
  id: number;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  createdAt: string;
};
