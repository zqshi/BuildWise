import { useCallback, useEffect, useState } from "react";
import type { OpsTriageTemplate } from "../../domain/workspace/platformTypes";
import { fetchOpsTriageTemplates } from "../../app/workspaceApi";
import { API_BASE } from "../../shared/apiConfig";

export type OpsTemplatesState = {
  opsTemplates: OpsTriageTemplate[];
  setOpsTemplates: React.Dispatch<React.SetStateAction<OpsTriageTemplate[]>>;
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

/* ── 子 hook：模板数据的拉取与刷新 ── */
function useOpsTemplateFetch(projectId: number | undefined) {
  const [opsTemplates, setOpsTemplates] = useState<OpsTriageTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchOpsTriageTemplates(projectId)
      .then((payload) => {
        if (!cancelled) setOpsTemplates(payload.templates || []);
      })
      .catch((err) => {
        console.debug("[useOpsTemplates] 加载失败", err);
        if (!cancelled) setOpsTemplates([]);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const reloadOpsTemplates = useCallback(async () => {
    const payload = await fetchOpsTriageTemplates(projectId);
    setOpsTemplates(payload.templates || []);
  }, [projectId]);

  return { opsTemplates, setOpsTemplates, reloadOpsTemplates };
}

/* ── 纯函数：根据步骤文本匹配模板并生成运维命令 ── */
function buildOpsCommandTemplates(
  step: string, projectId: number, templates: OpsTriageTemplate[],
): string[] {
  const lowered = step.toLowerCase();
  const matched = templates.filter((t) => t.keywords.some((kw) => lowered.includes(kw.toLowerCase())));
  if (matched.length > 0) {
    const applyVars = (cmd: string) =>
      cmd.split("{{projectId}}").join(String(projectId))
        .split("{{apiBase}}").join(API_BASE)
        .split("{{backendDir}}").join("backend");
    return Array.from(
      new Set(matched.flatMap((t) => t.commands).map(applyVars)),
    ).slice(0, 6);
  }
  return buildFallbackCommands(lowered, projectId);
}

function buildFallbackCommands(lowered: string, projectId: number): string[] {
  const commands: string[] = [];
  if (lowered.includes("健康") || lowered.includes("health") || lowered.includes("就绪") || lowered.includes("ready")) {
    commands.push(`curl -sS ${API_BASE}/health`, `curl -sS ${API_BASE}/ready`);
  }
  if (lowered.includes("指标") || lowered.includes("metric") || lowered.includes("错误率") || lowered.includes("延迟")) {
    commands.push(`curl -sS ${API_BASE}/api/v1/ops/metrics`, `curl -sS ${API_BASE}/api/v1/ops/runtime`);
  }
  if (lowered.includes("发布") || lowered.includes("deploy")) {
    commands.push(`curl -sS ${API_BASE}/api/v1/ops/deployments`, `cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
  }
  if (lowered.includes("回滚") || lowered.includes("rollback")) {
    commands.push(`cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
  }
  if (commands.length === 0) {
    commands.push(`curl -sS ${API_BASE}/api/v1/ops/runtime`, `curl -sS ${API_BASE}/api/v1/ops/metrics`);
  }
  return Array.from(new Set(commands)).slice(0, 4);
}

/* ── 主 hook ── */
export function useOpsTemplates(projectId: number | undefined): OpsTemplatesState {
  const { opsTemplates, setOpsTemplates, reloadOpsTemplates } = useOpsTemplateFetch(projectId);
  return { opsTemplates, setOpsTemplates, reloadOpsTemplates, buildOpsCommandTemplates };
}
