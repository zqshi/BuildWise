import { useEffect, useState } from "react";
import type { OpsTriageTemplate } from "../../domain/workspace/platformTypes";
import { fetchOpsTriageTemplates } from "../../app/workspaceApi";
import { API_BASE } from "../../app/workspaceApiCore";

export type OpsTemplatesState = {
  opsTemplates: OpsTriageTemplate[];
  setOpsTemplates: React.Dispatch<React.SetStateAction<OpsTriageTemplate[]>>;
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

export function useOpsTemplates(projectId: number | undefined): OpsTemplatesState {
  const [opsTemplates, setOpsTemplates] = useState<OpsTriageTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchOpsTriageTemplates(projectId)
      .then((payload) => {
        if (!cancelled) {
          setOpsTemplates(payload.templates || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpsTemplates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const reloadOpsTemplates = async () => {
    const payload = await fetchOpsTriageTemplates(projectId);
    setOpsTemplates(payload.templates || []);
  };

  const buildOpsCommandTemplates = (step: string, projectId: number, templates: OpsTriageTemplate[]): string[] => {
    const lowered = step.toLowerCase();
    const matched = templates.filter((template) => template.keywords.some((keyword) => lowered.includes(keyword.toLowerCase())));
    if (matched.length > 0) {
      const applyVars = (command: string) =>
        command
          .split("{{projectId}}")
          .join(String(projectId))
          .split("{{apiBase}}")
          .join(API_BASE)
          .split("{{backendDir}}")
          .join("backend");
      return Array.from(
        new Set(
          matched
            .flatMap((template) => template.commands)
            .map((command) => applyVars(command)),
        ),
      ).slice(0, 6);
    }
    const commands: string[] = [];
    if (lowered.includes("健康") || lowered.includes("health") || lowered.includes("就绪") || lowered.includes("ready")) {
      commands.push(`curl -sS ${API_BASE}/health`);
      commands.push(`curl -sS ${API_BASE}/ready`);
    }
    if (lowered.includes("指标") || lowered.includes("metric") || lowered.includes("错误率") || lowered.includes("延迟")) {
      commands.push(`curl -sS ${API_BASE}/api/v1/ops/metrics`);
      commands.push(`curl -sS ${API_BASE}/api/v1/ops/runtime`);
    }
    if (lowered.includes("发布") || lowered.includes("deploy")) {
      commands.push(`curl -sS ${API_BASE}/api/v1/ops/deployments`);
      commands.push(`cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
    }
    if (lowered.includes("回滚") || lowered.includes("rollback")) {
      commands.push(`cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
    }
    if (commands.length === 0) {
      commands.push(`curl -sS ${API_BASE}/api/v1/ops/runtime`);
      commands.push(`curl -sS ${API_BASE}/api/v1/ops/metrics`);
    }
    return Array.from(new Set(commands)).slice(0, 4);
  };

  return {
    opsTemplates,
    setOpsTemplates,
    reloadOpsTemplates,
    buildOpsCommandTemplates,
  };
}
