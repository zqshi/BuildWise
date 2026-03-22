import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { AuditLog, GovernanceRole } from "../domain/workspace/governanceTypes";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  ProjectShare,
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot,
} from "../domain/workspace/platformTypes";

type PlatformContextValue = {
  governanceRoles: GovernanceRole[];
  setGovernanceRoles: React.Dispatch<React.SetStateAction<GovernanceRole[]>>;
  auditLogs: AuditLog[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  versionSnapshots: VersionSnapshot[];
  setVersionSnapshots: React.Dispatch<React.SetStateAction<VersionSnapshot[]>>;
  projectShares: ProjectShare[];
  setProjectShares: React.Dispatch<React.SetStateAction<ProjectShare[]>>;
  templates: TemplateItem[];
  setTemplates: React.Dispatch<React.SetStateAction<TemplateItem[]>>;
  templateRuns: TemplateRunHistory[];
  setTemplateRuns: React.Dispatch<React.SetStateAction<TemplateRunHistory[]>>;
  latestTemplateRun: TemplateRunResult | null;
  setLatestTemplateRun: React.Dispatch<React.SetStateAction<TemplateRunResult | null>>;
  deployments: DeploymentRecord[];
  setDeployments: React.Dispatch<React.SetStateAction<DeploymentRecord[]>>;
  shareAccess: ShareAccessPayload | null;
  setShareAccess: React.Dispatch<React.SetStateAction<ShareAccessPayload | null>>;
  opsMetrics: OpsMetricsPayload | null;
  setOpsMetrics: React.Dispatch<React.SetStateAction<OpsMetricsPayload | null>>;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [governanceRoles, setGovernanceRoles] = useState<GovernanceRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [versionSnapshots, setVersionSnapshots] = useState<VersionSnapshot[]>([]);
  const [projectShares, setProjectShares] = useState<ProjectShare[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateRuns, setTemplateRuns] = useState<TemplateRunHistory[]>([]);
  const [latestTemplateRun, setLatestTemplateRun] = useState<TemplateRunResult | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [shareAccess, setShareAccess] = useState<ShareAccessPayload | null>(null);
  const [opsMetrics, setOpsMetrics] = useState<OpsMetricsPayload | null>(null);

  const value = useMemo(
    () => ({
      governanceRoles,
      setGovernanceRoles,
      auditLogs,
      setAuditLogs,
      versionSnapshots,
      setVersionSnapshots,
      projectShares,
      setProjectShares,
      templates,
      setTemplates,
      templateRuns,
      setTemplateRuns,
      latestTemplateRun,
      setLatestTemplateRun,
      deployments,
      setDeployments,
      shareAccess,
      setShareAccess,
      opsMetrics,
      setOpsMetrics,
    }),
    [governanceRoles, auditLogs, versionSnapshots, projectShares, templates, templateRuns, latestTemplateRun, deployments, shareAccess, opsMetrics]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatformContext() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("Missing PlatformProvider");
  return ctx;
}
