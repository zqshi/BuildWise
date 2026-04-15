import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, Project } from "../../domain/workspace/types";
import { pickString } from "../../shared/utils";
import { safeJsonParse } from '../workspace/upload/attachmentUtils';
import { nowIso, opsTriageTemplates, randomToken } from "./platformSupport";
import { listUncoveredAcceptanceCriteria } from '../workspace/shared/common';

type OpsHypothesis = { priority: "P0" | "P1" | "P2"; item: string; evidence: string };
type OpsTriageStep = { step: string; expectedSignal: string; fallback: string; commands: string[] };

function buildRuleBasedHypotheses(
  mergedText: string,
  deploySuccessRate: number,
  matrixPassRate: number,
  p0Count: number
): OpsHypothesis[] {
  const hypotheses: OpsHypothesis[] = [];
  if (/timeout|超时|latency|慢|延迟/.test(mergedText)) {
    hypotheses.push({ priority: "P0", item: "可能存在上游依赖超时或连接池耗尽。", evidence: "告警文本命中 timeout/延迟 关键词。" });
  }
  if (/db|database|数据库|sql|连接/.test(mergedText)) {
    hypotheses.push({ priority: "P0", item: "数据库连接或慢查询导致服务退化。", evidence: "告警文本命中 db/sql/数据库 关键词。" });
  }
  if (/memory|oom|内存|cpu|负载/.test(mergedText)) {
    hypotheses.push({ priority: "P1", item: "资源瓶颈（CPU/内存）导致实例不稳定。", evidence: "告警文本命中资源类关键词。" });
  }
  if (deploySuccessRate < 80) {
    hypotheses.push({ priority: "P1", item: "近期发布成功率偏低，可能存在发布工单质量回退。", evidence: `deployment_success_rate=${deploySuccessRate}%` });
  }
  if (matrixPassRate < 75) {
    hypotheses.push({ priority: "P1", item: "测试通过率不足，线上故障可能由未覆盖回归引入。", evidence: `iteration_test_matrix_pass_rate=${matrixPassRate}%` });
  }
  if (p0Count > 0) {
    hypotheses.push({ priority: "P1", item: "当前仍有 P0 分析发现未闭环，需优先排查相关代码路径。", evidence: `iteration_p0_findings_total=${p0Count}` });
  }
  return hypotheses;
}

function buildBaseTriageSteps(): OpsTriageStep[] {
  return [
    {
      step: "确认告警来源与影响面", expectedSignal: "影响用户数、请求量下降幅度、错误率变化",
      fallback: "如无监控数据，查询最近 5 分钟的错误日志", commands: ["kubectl logs -l app=buildwise --tail=200 --since=5m"]
    },
    {
      step: "排查上游依赖状态", expectedSignal: "数据库/缓存/外部 API 响应时间与错误率",
      fallback: "手动 curl 关键上游健康检查端点",
      commands: ["curl -sS {{apiBase}}/healthz", "curl -sS {{apiBase}}/api/v1/system/readyz"]
    },
    {
      step: "定位最近变更", expectedSignal: "最近 2 小时内的代码或配置变更记录",
      fallback: "检查 CI/CD 最近执行记录", commands: ["git log --oneline -10"]
    }
  ];
}

function buildOpsAlertDisposition(
  severity: "low" | "medium" | "high" | "critical",
  shouldRollback: boolean,
  rollbackTrigger?: string
) {
  const escalation = severity === "critical" || severity === "high" ? "team-lead" : "oncall";
  const action = shouldRollback ? "rollback" : severity === "critical" ? "escalate" : "investigate";
  return {
    action,
    escalationOwner: escalation,
    rationale: `severity=${severity};rollback=${shouldRollback}`,
    rollbackSuggestion: shouldRollback ? `建议回滚（触发条件：${rollbackTrigger || severity}）` : "暂不回滚",
    rollbackTrigger: rollbackTrigger || ""
  };
}

export function checkDeploymentReleaseGates(project: Project, targetIteration: Iteration, environment: "staging" | "production"): string[] {
  const blockers: string[] = [];
  const projectRepo = project.repository;
  const repoMode = projectRepo?.repoMode || "hybrid";
  const governance = projectRepo?.governance || { requireRemoteForProduction: true, requireRemoteForStaging: false };
  const requireRemote = environment === "production" ? governance.requireRemoteForProduction : governance.requireRemoteForStaging;
  const remoteConfigured =
    Boolean(projectRepo?.remote?.status === "provisioned") ||
    Boolean((projectRepo?.url || "").trim() && /^(https?:\/\/|git@|ssh:\/\/)/i.test((projectRepo?.url || "").trim())) ||
    Boolean(projectRepo?.health?.remoteConfigured);
  const remoteReachable = projectRepo?.health?.remoteReachable;
  if (requireRemote && repoMode === "managed_local") blockers.push("当前仓库模式为 managed_local，按门禁要求需先绑定远端 Git 仓库。");
  if (requireRemote && !remoteConfigured) blockers.push("远端 Git 仓库未配置，无法通过发布门禁。");
  if (requireRemote && remoteConfigured && remoteReachable === false) blockers.push("远端 Git 仓库当前不可达，请检查网络或仓库权限。");

  const control = targetIteration.changeControl;
  if (control?.pendingHumanConfirmation) blockers.push("分析结果尚未人工确认（pendingHumanConfirmation=true）");
  if (control?.lastReleaseReviewDecision === "block") {
    blockers.push(control.lastReleaseReviewReason || "发布评审结论为 block");
    if (Array.isArray(control.lastReleaseReviewBlockers)) blockers.push(...control.lastReleaseReviewBlockers);
  }
  if (environment === "production" && control?.lastReleaseReviewDecision === "caution") blockers.push("生产环境发布要求 releaseReview=go，当前为 caution");
  const releaseScore = Number(control?.lastReleaseReviewScore || 0);
  if (environment === "production" && releaseScore > 0 && releaseScore < 75) blockers.push(`生产环境发布要求 releaseReviewScore>=75，当前为 ${releaseScore}`);

  const matrix = Array.isArray(control?.generatedTestMatrix) ? control?.generatedTestMatrix : [];
  const failedOrBlocked = matrix.filter((item) => item.executionStatus === "failed" || item.executionStatus === "blocked");
  if (failedOrBlocked.length > 0) blockers.push(`测试矩阵存在失败/阻断用例 ${failedOrBlocked.length} 条`);
  if (environment === "production" && matrix.length > 0) {
    const pendingCount = matrix.filter((item) => item.executionStatus === "pending").length;
    if (pendingCount > 0) blockers.push(`生产发布前仍有 pending 测试用例 ${pendingCount} 条`);
  }

  const acceptanceChecklist = Array.isArray(control?.qualityArtifacts?.acceptanceChecklist) ? control?.qualityArtifacts.acceptanceChecklist : [];
  if (acceptanceChecklist.length === 0) blockers.push("缺少验收清单（acceptanceChecklist）");
  const uncoveredAcceptanceCriteria = listUncoveredAcceptanceCriteria(targetIteration.scope?.acceptanceCriteria ?? [], acceptanceChecklist, []);
  if (uncoveredAcceptanceCriteria.length > 0) blockers.push(`验收标准未完全覆盖（未覆盖 ${uncoveredAcceptanceCriteria.length} 项）`);

  const boundaryCodePaths = Array.isArray(control?.boundary?.codePaths)
    ? control?.boundary.codePaths
    : Array.isArray(control?.executableConstraints?.codePathWhitelist) ? control?.executableConstraints.codePathWhitelist : [];
  if (boundaryCodePaths.length === 0) blockers.push("缺少代码路径白名单（boundary.codePaths）");
  return blockers;
}

export class PlatformOpsDelegate {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly writeAudit: (action: string, resource: string, detail: string) => void
  ) {}

  private async runOpsAdvisorLlm(input: {
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    signals: string[];
    metricsDigest: string;
  }) {
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const baseUrlRaw = (processEnv.LLM_API_BASE || "").trim().replace(/\/+$/, "");
    const model = (processEnv.LLM_MODEL || "gpt-4o-mini").trim();
    const apiKey = (processEnv.LLM_API_KEY || "").trim();
    if (!baseUrlRaw) return null;
    try {
      const response = await fetch(`${baseUrlRaw}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model, temperature: 0.2, max_tokens: 1000,
          messages: [
            { role: "system", content: "你是发布运维顾问。只输出 JSON：{hypotheses:[{priority,item,evidence}], triageSteps:[{step,expectedSignal,fallback}], rollbackDecision:{shouldRollback,reason,trigger}}" },
            { role: "user", content: [`severity=${input.severity}`, `title=${input.title}`, `description=${input.description || "-"}`, `signals=${input.signals.join(" | ") || "-"}`, `metrics=${input.metricsDigest}`].join("\n") }
          ]
        })
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content?.trim() || "";
      const parsed = safeJsonParse(content);
      if (!parsed) return null;
      const hypotheses = Array.isArray(parsed.hypotheses) ? (parsed.hypotheses as Array<Record<string, unknown>>) : [];
      const triageSteps = Array.isArray(parsed.triageSteps) ? (parsed.triageSteps as Array<Record<string, unknown>>) : [];
      const rollbackDecision = (parsed.rollbackDecision || {}) as Record<string, unknown>;
      return {
        hypotheses: hypotheses.map((item) => ({ priority: pickString(item.priority) as "P0" | "P1" | "P2", item: pickString(item.item), evidence: pickString(item.evidence) })).filter((item) => (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && item.item).slice(0, 6),
        triageSteps: triageSteps.map((item) => ({ step: pickString(item.step), expectedSignal: pickString(item.expectedSignal), fallback: pickString(item.fallback) })).filter((item) => item.step).slice(0, 6),
        rollbackDecision: { shouldRollback: Boolean(rollbackDecision.shouldRollback), reason: pickString(rollbackDecision.reason), trigger: pickString(rollbackDecision.trigger) }
      };
    } catch { return null; }
  }

  getOpsMetrics() {
    const workspace = this.workspaceRepo.read();
    const deployTotal = workspace.deployments.length;
    const deploySuccess = workspace.deployments.filter((item) => item.status === "success").length;
    const activeShares = workspace.projectShares.filter((item) => new Date(item.expiresAt).getTime() > Date.now()).length;
    const iterations = Array.isArray(workspace.iterations) ? workspace.iterations : [];
    const analyzedIterations = iterations.filter((item) => Boolean(item?.changeControl?.lastAnalysisAt)).length;
    const generatedMatrixIterations = iterations.filter((item) => Array.isArray(item?.changeControl?.generatedTestMatrix) && item.changeControl.generatedTestMatrix.length > 0).length;
    const testMatrixCasesTotal = iterations.reduce((total, item) => total + (Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix.length : 0), 0);
    const testMatrixExecutedCasesTotal = iterations.reduce((total, item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      return total + cases.filter((tc) => tc.executionStatus && tc.executionStatus !== "pending").length;
    }, 0);
    const testMatrixPassedCasesTotal = iterations.reduce((total, item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      return total + cases.filter((tc) => tc.executionStatus === "passed").length;
    }, 0);
    const testMatrixExecutionCompletedTotal = iterations.filter((item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      return cases.length > 0 && cases.every((tc) => tc.executionStatus && tc.executionStatus !== "pending");
    }).length;
    const testMatrixCoverage = analyzedIterations === 0 ? 100 : Math.round((generatedMatrixIterations / analyzedIterations) * 100);
    const testMatrixExecutionCoverage = testMatrixCasesTotal === 0 ? 100 : Math.round((testMatrixExecutedCasesTotal / testMatrixCasesTotal) * 100);
    const testMatrixPassRate = testMatrixExecutedCasesTotal === 0 ? (testMatrixCasesTotal === 0 ? 100 : 0) : Math.round((testMatrixPassedCasesTotal / testMatrixExecutedCasesTotal) * 100);
    const p0FindingsTotal = iterations.reduce((total, item) => total + (Number(item?.changeControl?.lastAnalysisP0Count || 0) || 0), 0);
    const highValueFindingsTotal = iterations.reduce((total, item) => total + (Number(item?.changeControl?.lastAnalysisHighValueCount || 0) || 0), 0);
    const highValueIterations = iterations.filter((item) => Number(item?.changeControl?.lastAnalysisHighValueCount || 0) > 0).length;
    const analyzedIterationsWithFindingsCoverage = analyzedIterations === 0 ? 100 : Math.round((highValueIterations / analyzedIterations) * 100);
    const consideredFilesTotal = iterations.reduce((total, item) => total + (Number(item?.changeControl?.lastAnalysisConsideredFiles || 0) || 0), 0);
    const ignoredFilesTotal = iterations.reduce((total, item) => total + (Number(item?.changeControl?.lastAnalysisIgnoredFiles || 0) || 0), 0);
    const ignoredFilesRatio = consideredFilesTotal === 0 ? 0 : Math.round((ignoredFilesTotal / consideredFilesTotal) * 100);
    const latestAuditAt = workspace.auditLogs.length ? workspace.auditLogs[workspace.auditLogs.length - 1].createdAt : "";
    return {
      generatedAt: nowIso(),
      metrics: [
        { name: "deployment_success_rate", value: deployTotal === 0 ? 100 : Math.round((deploySuccess / deployTotal) * 100), unit: "%" },
        { name: "iteration_analyzed_total", value: analyzedIterations, unit: "count" },
        { name: "iteration_test_matrix_generated_total", value: generatedMatrixIterations, unit: "count" },
        { name: "iteration_test_matrix_cases_total", value: testMatrixCasesTotal, unit: "count" },
        { name: "iteration_test_matrix_coverage", value: testMatrixCoverage, unit: "%" },
        { name: "iteration_test_matrix_executed_cases_total", value: testMatrixExecutedCasesTotal, unit: "count" },
        { name: "iteration_test_matrix_execution_completed_total", value: testMatrixExecutionCompletedTotal, unit: "count" },
        { name: "iteration_test_matrix_execution_coverage", value: testMatrixExecutionCoverage, unit: "%" },
        { name: "iteration_test_matrix_pass_rate", value: testMatrixPassRate, unit: "%" },
        { name: "iteration_p0_findings_total", value: p0FindingsTotal, unit: "count" },
        { name: "iteration_high_value_findings_total", value: highValueFindingsTotal, unit: "count" },
        { name: "iteration_high_value_findings_coverage", value: analyzedIterationsWithFindingsCoverage, unit: "%" },
        { name: "iteration_analysis_ignored_files_ratio", value: ignoredFilesRatio, unit: "%" },
        { name: "active_share_links", value: activeShares, unit: "count" },
        { name: "audit_events_total", value: workspace.auditLogs.length, unit: "count" }
      ],
      latestAuditAt
    };
  }

  listOpsTriageTemplates() {
    const workspace = this.workspaceRepo.read();
    const customTemplates = Array.isArray(workspace.opsTriageTemplates) ? workspace.opsTriageTemplates : [];
    return {
      generatedAt: nowIso(),
      templates: [
        ...opsTriageTemplates.map((item) => ({
          id: item.id, category: item.category, keywords: [...item.keywords], commands: [...item.commands], note: item.note, source: "system" as const, projectId: undefined
        })),
        ...customTemplates.map((item) => ({
          id: item.id, category: item.category, keywords: Array.isArray(item.keywords) ? item.keywords : [], commands: Array.isArray(item.commands) ? item.commands : [], note: item.note || "", source: "custom" as const, projectId: item.projectId
        }))
      ]
    };
  }

  upsertOpsTriageTemplate(input: { id?: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note?: string }) {
    const workspace = this.workspaceRepo.read();
    const now = nowIso();
    const normalized = {
      id: input.id?.trim() || randomToken("triage_"),
      projectId: typeof input.projectId === "number" && input.projectId > 0 ? input.projectId : undefined,
      category: input.category.trim() || "general",
      keywords: input.keywords.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      commands: input.commands.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      note: input.note?.trim() || "",
      updatedAt: now
    };
    if (normalized.keywords.length === 0 || normalized.commands.length === 0) {
      return { ok: false as const, reason: "invalid_template" };
    }
    const templates = Array.isArray(workspace.opsTriageTemplates) ? [...workspace.opsTriageTemplates] : [];
    const index = templates.findIndex((item) => item.id === normalized.id);
    if (index >= 0) { templates[index] = { ...templates[index], ...normalized }; }
    else { templates.push(normalized); }
    this.workspaceRepo.write({ ...workspace, opsTriageTemplates: templates });
    this.writeAudit("ops_triage_template_upserted", `template:${normalized.id}`, `projectId=${normalized.projectId || "global"}`);
    return { ok: true as const, data: normalized };
  }

  deleteOpsTriageTemplate(templateId: string) {
    const workspace = this.workspaceRepo.read();
    const templates = Array.isArray(workspace.opsTriageTemplates) ? workspace.opsTriageTemplates : [];
    const index = templates.findIndex((item) => item.id === templateId);
    if (index < 0) return { ok: false as const, reason: "template_not_found" };
    const removed = templates[index];
    const next = [...templates.slice(0, index), ...templates.slice(index + 1)];
    this.workspaceRepo.write({ ...workspace, opsTriageTemplates: next });
    this.writeAudit("ops_triage_template_deleted", `template:${templateId}`, `projectId=${removed.projectId || "global"}`);
    return { ok: true as const };
  }

  listOpsTriageTemplatesByProject(projectId?: number) {
    const all = this.listOpsTriageTemplates();
    if (!projectId || projectId <= 0) return all;
    return { ...all, templates: all.templates.filter((item) => item.source === "system" || item.projectId === projectId) };
  }

  async analyzeOpsAlert(input: { projectId: number; severity?: "low" | "medium" | "high" | "critical"; title: string; description?: string; signals?: string[] }) {
    const severity = input.severity || "medium";
    const title = (input.title || "").trim();
    const description = (input.description || "").trim();
    const mergedText = `${title}\n${description}\n${(input.signals || []).join("\n")}`.toLowerCase();
    const templates = this.listOpsTriageTemplatesByProject(input.projectId).templates;
    const matchedTemplates = templates.filter((tpl) => tpl.keywords.some((keyword) => keyword && mergedText.includes(keyword.toLowerCase()))).slice(0, 6);
    const metrics = this.getOpsMetrics().metrics;
    const metricMap = new Map(metrics.map((item) => [item.name, item.value]));
    const hypotheses = buildRuleBasedHypotheses(mergedText, Number(metricMap.get("deployment_success_rate") || 0), Number(metricMap.get("iteration_test_matrix_pass_rate") || 0), Number(metricMap.get("iteration_p0_findings_total") || 0));
    const triageSteps = buildBaseTriageSteps();
    for (const tpl of matchedTemplates) {
      if (triageSteps.length >= 6) break;
      triageSteps.push({ step: `模板排障：${tpl.category}`, expectedSignal: "模板命令输出与告警现象一致", fallback: "若模板步骤无法复现，请回到基础三步排障流程", commands: tpl.commands.slice(0, 4) });
    }
    const llmResult = await this.runOpsAdvisorLlm({
      severity, title, description, signals: Array.isArray(input.signals) ? input.signals.slice(0, 12) : [], metricsDigest: metrics.slice(0, 8).map((item) => `${item.name}=${item.value}${item.unit || ""}`).join("; ")
    });
    const finalHypotheses = llmResult?.hypotheses?.length ? llmResult.hypotheses : hypotheses.slice(0, 6);
    const finalTriageSteps = llmResult?.triageSteps?.length ? llmResult.triageSteps.map((item) => ({ ...item, commands: [] as string[] })) : triageSteps.slice(0, 6);
    const shouldRollback = llmResult?.rollbackDecision.shouldRollback || severity === "critical" || finalHypotheses.some((item) => item.priority === "P0");
    const disposition = buildOpsAlertDisposition(severity, shouldRollback, llmResult?.rollbackDecision.trigger);
    return {
      generatedAt: nowIso(), projectId: input.projectId, severity, hypotheses: finalHypotheses,
      triageSteps: finalTriageSteps.map((item) => ({
        ...item,
        commands: Array.isArray((item as { commands?: string[] }).commands) && ((item as { commands?: string[] }).commands?.length ?? 0) > 0
          ? (item as { commands?: string[] }).commands?.slice(0, 4) : ["curl -sS {{apiBase}}/api/ops/runtime", "curl -sS {{apiBase}}/api/ops/metrics"]
      })),
      rollbackSuggestion: disposition.rollbackSuggestion,
      matchedTemplates: matchedTemplates.map((item) => item.id),
      disposition: { action: disposition.action, escalationOwner: disposition.escalationOwner, rationale: disposition.rationale, rollbackTrigger: disposition.rollbackTrigger }
    };
  }
}
