import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { pickString } from "../../shared/utils";
import { safeJsonParse } from "../workspace/attachmentOps";
import {
  deploymentTransitions,
  normalizeTemplateParameters,
  nowIso,
  opsTriageTemplates,
  projectTemplates,
  randomToken,
  resolveDeploymentIterationId,
  resolveIterationId
} from "./platformSupport";
import { listUncoveredAcceptanceCriteria } from "../workspace/workspaceServiceCommon";

export class PlatformService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository
  ) {}

  private writeAudit(action: string, resource: string, detail: string) {
    const workspace = this.workspaceRepo.read();
    this.workspaceRepo.appendAuditLog({
      id: this.workspaceRepo.nextId(workspace.auditLogs),
      actor: "system",
      action,
      resource,
      detail,
      createdAt: nowIso()
    });
  }

  private pickString = pickString;

  private async runOpsAdvisorLlm(input: {
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    signals: string[];
    metricsDigest: string;
  }) {
    // TECH DEBT: LLM config is read directly from process.env instead of runtimeConfig.
    // runtimeConfig does not yet expose LLM_API_BASE / LLM_API_KEY / LLM_MODEL.
    // When those are added to RuntimeConfig, this code should switch to use them.
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const baseUrlRaw = (processEnv.LLM_API_BASE || "").trim().replace(/\/+$/, "");
    const model = (processEnv.LLM_MODEL || "gpt-4o-mini").trim();
    const apiKey = (processEnv.LLM_API_KEY || "").trim();
    if (!baseUrlRaw) {
      return null;
    }
    try {
      const response = await fetch(`${baseUrlRaw}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1000,
          messages: [
            {
              role: "system",
              content:
                "你是发布运维顾问。只输出 JSON：{hypotheses:[{priority,item,evidence}], triageSteps:[{step,expectedSignal,fallback}], rollbackDecision:{shouldRollback,reason,trigger}}"
            },
            {
              role: "user",
              content: [
                `severity=${input.severity}`,
                `title=${input.title}`,
                `description=${input.description || "-"}`,
                `signals=${input.signals.join(" | ") || "-"}`,
                `metrics=${input.metricsDigest}`
              ].join("\n")
            }
          ]
        })
      });
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim() || "";
      const parsed = safeJsonParse(content);
      if (!parsed) {
        return null;
      }
      const hypotheses = Array.isArray(parsed.hypotheses) ? (parsed.hypotheses as Array<Record<string, unknown>>) : [];
      const triageSteps = Array.isArray(parsed.triageSteps) ? (parsed.triageSteps as Array<Record<string, unknown>>) : [];
      const rollbackDecision = (parsed.rollbackDecision || {}) as Record<string, unknown>;
      return {
        hypotheses: hypotheses
          .map((item) => ({
            priority: this.pickString(item.priority) as "P0" | "P1" | "P2",
            item: this.pickString(item.item),
            evidence: this.pickString(item.evidence)
          }))
          .filter((item) => (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && item.item)
          .slice(0, 6),
        triageSteps: triageSteps
          .map((item) => ({
            step: this.pickString(item.step),
            expectedSignal: this.pickString(item.expectedSignal),
            fallback: this.pickString(item.fallback)
          }))
          .filter((item) => item.step)
          .slice(0, 6),
        rollbackDecision: {
          shouldRollback: Boolean(rollbackDecision.shouldRollback),
          reason: this.pickString(rollbackDecision.reason),
          trigger: this.pickString(rollbackDecision.trigger)
        }
      };
    } catch {
      return null;
    }
  }

  listVersionSnapshots(projectId: number) {
    return this.workspaceRepo.listVersionSnapshots(projectId);
  }

  createVersionSnapshot(projectId: number, iterationId: number, name: string, note: string) {
    const project = this.workspaceRepo.findProject(projectId);
    const iteration = this.workspaceRepo.findIteration(iterationId);
    if (!project || !iteration || iteration.projectId !== projectId) {
      return null;
    }
    const data = this.workspaceRepo.read();
    const created = {
      id: this.workspaceRepo.nextId(data.versionSnapshots),
      projectId,
      iterationId,
      name,
      note,
      status: iteration.status,
      progress: iteration.progress,
      scope: iteration.scope,
      assessment: iteration.assessment,
      createdAt: nowIso()
    };
    this.workspaceRepo.appendVersionSnapshot(created);
    this.writeAudit("version_snapshot_created", `snapshot:${created.id}`, `${name} @ iteration:${iterationId}`);
    return created;
  }

  restoreVersionSnapshot(snapshotId: number) {
    const snapshot = this.workspaceRepo.findVersionSnapshot(snapshotId);
    if (!snapshot) {
      return null;
    }
    const iteration = this.workspaceRepo.findIteration(snapshot.iterationId);
    if (!iteration) {
      return null;
    }
    iteration.status = snapshot.status;
    iteration.progress = snapshot.progress;
    iteration.scope = snapshot.scope;
    iteration.assessment = snapshot.assessment;
    this.workspaceRepo.updateIteration(iteration);
    this.writeAudit("version_snapshot_restored", `snapshot:${snapshotId}`, `restore iteration:${iteration.id}`);
    return { ok: true, snapshotId, iterationId: iteration.id };
  }

  listProjectShares(projectId: number) {
    return this.workspaceRepo.listProjectShares(projectId);
  }

  createProjectShare(projectId: number, permission: "read" | "comment", ttlHours: number) {
    const project = this.workspaceRepo.findProject(projectId);
    if (!project) {
      return null;
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
    const data = this.workspaceRepo.read();
    const created = {
      id: this.workspaceRepo.nextId(data.projectShares),
      projectId,
      token: randomToken("shr_"),
      permission,
      expiresAt,
      createdAt: now.toISOString()
    };
    this.workspaceRepo.appendProjectShare(created);
    this.writeAudit("project_shared", `project:${projectId}`, `permission=${permission}`);
    return created;
  }

  listTemplates() {
    return [...projectTemplates];
  }

  runTemplate(templateId: string, projectId: number) {
    const template = this.listTemplates().find((item) => item.id === templateId);
    const project = this.workspaceRepo.findProject(projectId);
    if (!template || !project) {
      return null;
    }
    const createdAt = nowIso();
    const runId = randomToken("run_");
    const iterationId = resolveIterationId(this.workspaceRepo, projectId);
    const result = {
      runId,
      templateId,
      projectId,
      status: "completed",
      startedAt: createdAt,
      finishedAt: createdAt,
      summary: `已为项目 ${project.name} 执行模板 ${template.name}`
    };
    const data = this.workspaceRepo.read();
    this.workspaceRepo.appendTemplateRun({
      id: this.workspaceRepo.nextId(data.templateRuns),
      runId,
      templateId,
      projectId,
      parameters: iterationId ? { iterationId: String(iterationId) } : {},
      status: "completed",
      startedAt: createdAt,
      finishedAt: createdAt,
      summary: result.summary
    });
    this.writeAudit("template_run_completed", `template:${templateId}`, `project:${projectId}`);
    return result;
  }

  runTemplateWithParams(templateId: string, projectId: number, parameters: Record<string, string>) {
    const template = this.listTemplates().find((item) => item.id === templateId);
    const project = this.workspaceRepo.findProject(projectId);
    if (!template || !project) {
      return null;
    }
    const startedAt = nowIso();
    const focused = parameters.focus || "默认目标";
    const summary = `已执行 ${template.name}，聚焦：${focused}`;
    const normalizedParameters = normalizeTemplateParameters(this.workspaceRepo, projectId, parameters);
    const record = {
      runId: randomToken("run_"),
      templateId,
      projectId,
      status: "completed" as const,
      startedAt,
      finishedAt: nowIso(),
      summary
    };
    const data = this.workspaceRepo.read();
    this.workspaceRepo.appendTemplateRun({
      id: this.workspaceRepo.nextId(data.templateRuns),
      runId: record.runId,
      templateId,
      projectId,
      parameters: normalizedParameters,
      status: "completed",
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      summary: record.summary
    });
    this.writeAudit("template_run_completed", `template:${templateId}`, `params:${JSON.stringify(normalizedParameters)}`);
    return record;
  }

  listTemplateRuns(projectId?: number) {
    return this.workspaceRepo.listTemplateRuns(projectId);
  }

  listDeployments(projectId?: number) {
    return this.workspaceRepo.listDeployments(projectId);
  }

  createDeployment(projectId: number, environment: "staging" | "production", version: string, iterationId?: number) {
    const project = this.workspaceRepo.findProject(projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" };
    }
    const resolvedIterationId = resolveDeploymentIterationId(this.workspaceRepo, projectId, iterationId);
    if (resolvedIterationId) {
      const targetIteration = this.workspaceRepo.findIteration(resolvedIterationId);
      if (!targetIteration) {
        return { ok: false as const, reason: "iteration_not_found" };
      }
      const blockers: string[] = [];
      const projectRepo = project.repository;
      const repoMode = projectRepo?.repoMode || "hybrid";
      const governance = projectRepo?.governance || {
        requireRemoteForProduction: true,
        requireRemoteForStaging: false
      };
      const requireRemote = environment === "production" ? governance.requireRemoteForProduction : governance.requireRemoteForStaging;
      const remoteConfigured =
        Boolean(projectRepo?.remote?.status === "provisioned") ||
        Boolean((projectRepo?.url || "").trim() && /^(https?:\/\/|git@|ssh:\/\/)/i.test((projectRepo?.url || "").trim())) ||
        Boolean(projectRepo?.health?.remoteConfigured);
      const remoteReachable = projectRepo?.health?.remoteReachable;
      if (requireRemote && repoMode === "managed_local") {
        blockers.push("当前仓库模式为 managed_local，按门禁要求需先绑定远端 Git 仓库。");
      }
      if (requireRemote && !remoteConfigured) {
        blockers.push("远端 Git 仓库未配置，无法通过发布门禁。");
      }
      if (requireRemote && remoteConfigured && remoteReachable === false) {
        blockers.push("远端 Git 仓库当前不可达，请检查网络或仓库权限。");
      }
      const control = targetIteration.changeControl;
      if (control?.pendingHumanConfirmation) {
        blockers.push("分析结果尚未人工确认（pendingHumanConfirmation=true）");
      }
      if (control?.lastReleaseReviewDecision === "block") {
        blockers.push(control.lastReleaseReviewReason || "发布评审结论为 block");
        if (Array.isArray(control.lastReleaseReviewBlockers)) {
          blockers.push(...control.lastReleaseReviewBlockers);
        }
      }
      if (environment === "production" && control?.lastReleaseReviewDecision === "caution") {
        blockers.push("生产环境发布要求 releaseReview=go，当前为 caution");
      }
      const releaseScore = Number(control?.lastReleaseReviewScore || 0);
      if (environment === "production" && releaseScore > 0 && releaseScore < 75) {
        blockers.push(`生产环境发布要求 releaseReviewScore>=75，当前为 ${releaseScore}`);
      }
      const matrix = Array.isArray(control?.generatedTestMatrix) ? control?.generatedTestMatrix : [];
      const failedOrBlocked = matrix.filter((item) => item.executionStatus === "failed" || item.executionStatus === "blocked");
      if (failedOrBlocked.length > 0) {
        blockers.push(`测试矩阵存在失败/阻断用例 ${failedOrBlocked.length} 条`);
      }
      if (environment === "production" && matrix.length > 0) {
        const pendingCount = matrix.filter((item) => item.executionStatus === "pending").length;
        if (pendingCount > 0) {
          blockers.push(`生产发布前仍有 pending 测试用例 ${pendingCount} 条`);
        }
      }
      const acceptanceChecklist = Array.isArray(control?.qualityArtifacts?.acceptanceChecklist)
        ? control?.qualityArtifacts.acceptanceChecklist
        : [];
      if (acceptanceChecklist.length === 0) {
        blockers.push("缺少验收清单（acceptanceChecklist）");
      }
      const uncoveredAcceptanceCriteria = listUncoveredAcceptanceCriteria(
        targetIteration.scope?.acceptanceCriteria ?? [],
        acceptanceChecklist,
        []
      );
      if (uncoveredAcceptanceCriteria.length > 0) {
        blockers.push(`验收标准未完全覆盖（未覆盖 ${uncoveredAcceptanceCriteria.length} 项）`);
      }
      const boundaryCodePaths = Array.isArray(control?.boundary?.codePaths)
        ? control?.boundary.codePaths
        : Array.isArray(control?.executableConstraints?.codePathWhitelist)
          ? control?.executableConstraints.codePathWhitelist
          : [];
      if (boundaryCodePaths.length === 0) {
        blockers.push("缺少代码路径白名单（boundary.codePaths）");
      }
      if (blockers.length > 0) {
        return {
          ok: false as const,
          reason: "release_gate_blocked",
          message: "release gate blocked",
          blockers: Array.from(new Set(blockers)).slice(0, 20)
        };
      }
    }
    const data = this.workspaceRepo.read();
    const created = {
      id: this.workspaceRepo.nextId(data.deployments),
      projectId,
      iterationId: resolvedIterationId || undefined,
      environment,
      version,
      status: "queued" as const,
      createdAt: nowIso()
    };
    this.workspaceRepo.appendDeployment(created);
    this.writeAudit("deployment_created", `deployment:${created.id}`, `${environment}@${version} status=queued`);
    return { ok: true as const, data: created };
  }

  transitionDeployment(deploymentId: number, toStatus: "running" | "success" | "failed") {
    const deployment = this.workspaceRepo.findDeployment(deploymentId);
    if (!deployment) {
      return { ok: false as const, reason: "deployment_not_found" };
    }
    const fromStatus = deployment.status;
    const allowed = deploymentTransitions[deployment.status] || [];
    if (!allowed.includes(toStatus)) {
      return { ok: false as const, reason: "invalid_transition" };
    }
    deployment.status = toStatus;
    this.workspaceRepo.updateDeployment(deployment);
    this.writeAudit("deployment_transitioned", `deployment:${deploymentId}`, `${fromStatus} -> ${toStatus}`);
    return { ok: true as const, data: deployment };
  }

  getDeployment(deploymentId: number) {
    return this.workspaceRepo.findDeployment(deploymentId);
  }

  accessShare(token: string) {
    const share = this.workspaceRepo.findProjectShareByToken(token);
    if (!share) {
      return { ok: false as const, reason: "share_not_found" };
    }
    const expired = new Date(share.expiresAt).getTime() <= Date.now();
    if (expired) {
      return { ok: false as const, reason: "share_expired" };
    }
    const project = this.workspaceRepo.findProject(share.projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" };
    }
    const iterationCount = this.workspaceRepo.listIterations(share.projectId).length;
    return {
      ok: true as const,
      data: {
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt,
        project: {
          id: project.id,
          name: project.name,
          description: project.description
        },
        iterationCount
      }
    };
  }

  commentByShare(token: string, content: string) {
    const access = this.accessShare(token);
    if (!access.ok) {
      return access;
    }
    if (access.data.permission !== "comment") {
      return { ok: false as const, reason: "permission_denied" };
    }
    this.writeAudit("share_comment_added", `share:${token}`, content.slice(0, 120));
    return { ok: true as const, data: { ok: true, token, comment: content, createdAt: nowIso() } };
  }

  getOpsMetrics() {
    const workspace = this.workspaceRepo.read();
    const deployTotal = workspace.deployments.length;
    const deploySuccess = workspace.deployments.filter((item) => item.status === "success").length;
    const activeShares = workspace.projectShares.filter((item) => new Date(item.expiresAt).getTime() > Date.now()).length;
    const iterations = Array.isArray(workspace.iterations) ? workspace.iterations : [];
    const analyzedIterations = iterations.filter((item) => Boolean(item?.changeControl?.lastAnalysisAt)).length;
    const generatedMatrixIterations = iterations.filter(
      (item) => Array.isArray(item?.changeControl?.generatedTestMatrix) && item.changeControl.generatedTestMatrix.length > 0
    ).length;
    const testMatrixCasesTotal = iterations.reduce((total, item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix.length : 0;
      return total + cases;
    }, 0);
    const testMatrixExecutedCasesTotal = iterations.reduce((total, item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      return total + cases.filter((testCase) => testCase.executionStatus && testCase.executionStatus !== "pending").length;
    }, 0);
    const testMatrixPassedCasesTotal = iterations.reduce((total, item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      return total + cases.filter((testCase) => testCase.executionStatus === "passed").length;
    }, 0);
    const testMatrixExecutionCompletedTotal = iterations.filter((item) => {
      const cases = Array.isArray(item?.changeControl?.generatedTestMatrix) ? item.changeControl.generatedTestMatrix : [];
      if (cases.length === 0) {
        return false;
      }
      return cases.every((testCase) => testCase.executionStatus && testCase.executionStatus !== "pending");
    }).length;
    const testMatrixCoverage = analyzedIterations === 0 ? 100 : Math.round((generatedMatrixIterations / analyzedIterations) * 100);
    const testMatrixExecutionCoverage = testMatrixCasesTotal === 0 ? 100 : Math.round((testMatrixExecutedCasesTotal / testMatrixCasesTotal) * 100);
    const testMatrixPassRate =
      testMatrixExecutedCasesTotal === 0 ? (testMatrixCasesTotal === 0 ? 100 : 0) : Math.round((testMatrixPassedCasesTotal / testMatrixExecutedCasesTotal) * 100);
    const p0FindingsTotal = iterations.reduce((total, item) => total + (Number(item?.changeControl?.lastAnalysisP0Count || 0) || 0), 0);
    const highValueFindingsTotal = iterations.reduce(
      (total, item) => total + (Number(item?.changeControl?.lastAnalysisHighValueCount || 0) || 0),
      0
    );
    const highValueIterations = iterations.filter((item) => Number(item?.changeControl?.lastAnalysisHighValueCount || 0) > 0).length;
    const analyzedIterationsWithFindingsCoverage = analyzedIterations === 0 ? 100 : Math.round((highValueIterations / analyzedIterations) * 100);
    const consideredFilesTotal = iterations.reduce(
      (total, item) => total + (Number(item?.changeControl?.lastAnalysisConsideredFiles || 0) || 0),
      0
    );
    const ignoredFilesTotal = iterations.reduce(
      (total, item) => total + (Number(item?.changeControl?.lastAnalysisIgnoredFiles || 0) || 0),
      0
    );
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
          id: item.id,
          category: item.category,
          keywords: [...item.keywords],
          commands: [...item.commands],
          note: item.note,
          source: "system" as const,
          projectId: undefined
        })),
        ...customTemplates.map((item) => ({
          id: item.id,
          category: item.category,
          keywords: Array.isArray(item.keywords) ? item.keywords : [],
          commands: Array.isArray(item.commands) ? item.commands : [],
          note: item.note || "",
          source: "custom" as const,
          projectId: item.projectId
        }))
      ]
    };
  }

  upsertOpsTriageTemplate(input: {
    id?: string;
    projectId?: number;
    category: string;
    keywords: string[];
    commands: string[];
    note?: string;
  }) {
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
    if (index >= 0) {
      templates[index] = { ...templates[index], ...normalized };
    } else {
      templates.push(normalized);
    }
    this.workspaceRepo.write({ ...workspace, opsTriageTemplates: templates });
    this.writeAudit("ops_triage_template_upserted", `template:${normalized.id}`, `projectId=${normalized.projectId || "global"}`);
    return { ok: true as const, data: normalized };
  }

  deleteOpsTriageTemplate(templateId: string) {
    const workspace = this.workspaceRepo.read();
    const templates = Array.isArray(workspace.opsTriageTemplates) ? workspace.opsTriageTemplates : [];
    const index = templates.findIndex((item) => item.id === templateId);
    if (index < 0) {
      return { ok: false as const, reason: "template_not_found" };
    }
    const removed = templates[index];
    const next = [...templates.slice(0, index), ...templates.slice(index + 1)];
    this.workspaceRepo.write({ ...workspace, opsTriageTemplates: next });
    this.writeAudit("ops_triage_template_deleted", `template:${templateId}`, `projectId=${removed.projectId || "global"}`);
    return { ok: true as const };
  }

  listOpsTriageTemplatesByProject(projectId?: number) {
    const all = this.listOpsTriageTemplates();
    if (!projectId || projectId <= 0) {
      return all;
    }
    return {
      ...all,
      templates: all.templates.filter((item) => item.source === "system" || item.projectId === projectId)
    };
  }

  async analyzeOpsAlert(input: {
    projectId: number;
    severity?: "low" | "medium" | "high" | "critical";
    title: string;
    description?: string;
    signals?: string[];
  }) {
    const severity = input.severity || "medium";
    const title = (input.title || "").trim();
    const description = (input.description || "").trim();
    const mergedText = `${title}\n${description}\n${(input.signals || []).join("\n")}`.toLowerCase();
    const templates = this.listOpsTriageTemplatesByProject(input.projectId).templates;
    const matchedTemplates = templates
      .filter((tpl) => tpl.keywords.some((keyword) => keyword && mergedText.includes(keyword.toLowerCase())))
      .slice(0, 6);
    const metrics = this.getOpsMetrics().metrics;
    const metricMap = new Map(metrics.map((item) => [item.name, item.value]));
    const deploySuccessRate = Number(metricMap.get("deployment_success_rate") || 0);
    const matrixPassRate = Number(metricMap.get("iteration_test_matrix_pass_rate") || 0);
    const p0Count = Number(metricMap.get("iteration_p0_findings_total") || 0);
    const hypotheses: Array<{ priority: "P0" | "P1" | "P2"; item: string; evidence: string }> = [];

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

    const triageSteps = [
      {
        step: "确认运行时健康与错误分布",
        expectedSignal: "最近 15 分钟内错误率曲线与峰值区间",
        fallback: "若无法获取指标，先抓取最近失败部署与应用日志片段",
        commands: ["curl -sS {{apiBase}}/api/ops/runtime", "curl -sS {{apiBase}}/api/ops/metrics"]
      },
      {
        step: "定位最近改动与越界风险",
        expectedSignal: "故障窗口前后是否有高风险发布",
        fallback: "若无发布记录，检查外部依赖可用性",
        commands: ["curl -sS {{apiBase}}/api/ops/deployments", "cd {{backendDir}} && npm run ops:preflight"]
      },
      {
        step: "执行回滚决策前置校验",
        expectedSignal: "回滚后关键接口错误率下降",
        fallback: "若回滚不可行，先熔断高风险入口并降级",
        commands: ["cd {{backendDir}} && PROJECT_ID={{projectId}} npm run ops:rollback", "curl -sS {{apiBase}}/api/ops/deployments"]
      }
    ];
    for (const tpl of matchedTemplates) {
      if (triageSteps.length >= 6) {
        break;
      }
      triageSteps.push({
        step: `模板排障：${tpl.category}`,
        expectedSignal: "模板命令输出与告警现象一致",
        fallback: "若模板步骤无法复现，请回到基础三步排障流程",
        commands: tpl.commands.slice(0, 4)
      });
    }
    const llmResult = await this.runOpsAdvisorLlm({
      severity,
      title,
      description,
      signals: Array.isArray(input.signals) ? input.signals.slice(0, 12) : [],
      metricsDigest: metrics
        .slice(0, 8)
        .map((item) => `${item.name}=${item.value}${item.unit || ""}`)
        .join("; ")
    });
    const finalHypotheses = llmResult?.hypotheses?.length ? llmResult.hypotheses : hypotheses.slice(0, 6);
    const finalTriageSteps = llmResult?.triageSteps?.length
      ? llmResult.triageSteps.map((item) => ({
          ...item,
          commands: [] as string[]
        }))
      : triageSteps.slice(0, 6);
    const shouldRollback =
      llmResult?.rollbackDecision.shouldRollback || severity === "critical" || finalHypotheses.some((item) => item.priority === "P0");
    const dispositionAction: "observe" | "mitigate" | "rollback" = shouldRollback
      ? "rollback"
      : severity === "high" || severity === "medium"
        ? "mitigate"
        : "observe";
    const rollbackSuggestion = shouldRollback
      ? `建议立即进入受控回滚，并保留问题快照用于复盘。${llmResult?.rollbackDecision.reason ? `（${llmResult.rollbackDecision.reason}）` : ""}`
      : "建议先按排障步骤验证，不建议立即回滚。";
    return {
      generatedAt: nowIso(),
      projectId: input.projectId,
      severity,
      hypotheses: finalHypotheses,
      triageSteps: finalTriageSteps.map((item) => ({
        ...item,
        commands:
          Array.isArray((item as { commands?: string[] }).commands) && ((item as { commands?: string[] }).commands?.length ?? 0) > 0
            ? (item as { commands?: string[] }).commands?.slice(0, 4)
            : [
                "curl -sS {{apiBase}}/api/ops/runtime",
                "curl -sS {{apiBase}}/api/ops/metrics"
              ]
      })),
      rollbackSuggestion,
      matchedTemplates: matchedTemplates.map((item) => item.id),
      disposition: {
        action: dispositionAction,
        escalationOwner: severity === "critical" || severity === "high" ? "oncall-primary" : "service-owner",
        rationale: shouldRollback ? "触发高优先级故障信号或 LLM 建议回滚。" : "未命中强回滚条件，先执行止损与验证。",
        rollbackTrigger: llmResult?.rollbackDecision.trigger || "关键接口错误率持续上升且 15 分钟无恢复"
      }
    };
  }

}
