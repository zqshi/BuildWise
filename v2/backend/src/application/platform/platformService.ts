import type { ModelingRepository } from "../../domain/modeling/repository";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
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

export class PlatformService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly modelRepo: ModelingRepository
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

  exportOpenApi() {
    const model = this.modelRepo.read();
    const paths = Object.fromEntries(
      model.apis
        .filter((item) => item.path)
        .map((item) => [
          item.path as string,
          {
            [(item.method || "GET").toLowerCase()]: {
              summary: item.id || `Model endpoint ${item.path as string}`,
              responses: { 200: { description: "OK" } }
            }
          }
        ])
    );
    return {
      openapi: "3.0.3",
      info: { title: "BuildWise API", version: "1.0.0" },
      paths
    };
  }

  listDeployments(projectId?: number) {
    return this.workspaceRepo.listDeployments(projectId);
  }

  createDeployment(projectId: number, environment: "staging" | "production", version: string, iterationId?: number) {
    const project = this.workspaceRepo.findProject(projectId);
    if (!project) {
      return null;
    }
    const resolvedIterationId = resolveDeploymentIterationId(this.workspaceRepo, projectId, iterationId);
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
    return created;
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

}
