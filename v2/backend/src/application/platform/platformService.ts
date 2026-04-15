import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { PlatformOpsDelegate, checkDeploymentReleaseGates } from './platformOpsService';
import {
  deploymentTransitions,
  normalizeTemplateParameters,
  nowIso,
  projectTemplates,
  randomToken,
  resolveDeploymentIterationId,
  resolveIterationId
} from "./platformSupport";

export class PlatformService {
  private readonly opsDelegate: PlatformOpsDelegate;

  constructor(
    private readonly workspaceRepo: WorkspaceRepository
  ) {
    this.opsDelegate = new PlatformOpsDelegate(workspaceRepo, (a, r, d) => this.writeAudit(a, r, d));
  }

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
      const blockers = checkDeploymentReleaseGates(project, targetIteration, environment);
      if (blockers.length > 0) {
        return { ok: false as const, reason: "release_gate_blocked", message: "release gate blocked", blockers: Array.from(new Set(blockers)).slice(0, 20) };
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
    return this.opsDelegate.getOpsMetrics();
  }

  listOpsTriageTemplates() {
    return this.opsDelegate.listOpsTriageTemplates();
  }

  upsertOpsTriageTemplate(input: {
    id?: string;
    projectId?: number;
    category: string;
    keywords: string[];
    commands: string[];
    note?: string;
  }) {
    return this.opsDelegate.upsertOpsTriageTemplate(input);
  }

  deleteOpsTriageTemplate(templateId: string) {
    return this.opsDelegate.deleteOpsTriageTemplate(templateId);
  }

  listOpsTriageTemplatesByProject(projectId?: number) {
    return this.opsDelegate.listOpsTriageTemplatesByProject(projectId);
  }

  async analyzeOpsAlert(input: {
    projectId: number;
    severity?: "low" | "medium" | "high" | "critical";
    title: string;
    description?: string;
    signals?: string[];
  }) {
    return this.opsDelegate.analyzeOpsAlert(input);
  }

}
