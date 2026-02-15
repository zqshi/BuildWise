import type { ModelingRepository } from "../../domain/modeling/repository";
import type { WorkspaceRepository } from "../../domain/workspace/repository";

function nowIso() {
  return new Date().toISOString();
}

function randomToken() {
  return Math.random().toString(36).slice(2, 10);
}

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
      token: `shr_${randomToken()}`,
      permission,
      expiresAt,
      createdAt: now.toISOString()
    };
    this.workspaceRepo.appendProjectShare(created);
    this.writeAudit("project_shared", `project:${projectId}`, `permission=${permission}`);
    return created;
  }

  listTemplates() {
    return [
      {
        id: "tpl-req-review",
        name: "需求评审模板",
        category: "requirements",
        description: "生成需求评审清单与风险确认项"
      },
      {
        id: "tpl-api-mvp",
        name: "接口联调模板",
        category: "delivery",
        description: "生成联调步骤、验收项与回滚点"
      },
      {
        id: "tpl-release-check",
        name: "发版巡检模板",
        category: "ops",
        description: "生成发布前/后巡检动作与阈值"
      }
    ];
  }

  runTemplate(templateId: string, projectId: number) {
    const template = this.listTemplates().find((item) => item.id === templateId);
    const project = this.workspaceRepo.findProject(projectId);
    if (!template || !project) {
      return null;
    }
    const createdAt = nowIso();
    const result = {
      runId: `run_${randomToken()}`,
      templateId,
      projectId,
      status: "completed",
      startedAt: createdAt,
      finishedAt: createdAt,
      summary: `已为项目 ${project.name} 执行模板 ${template.name}`
    };
    this.writeAudit("template_run_completed", `template:${templateId}`, `project:${projectId}`);
    return result;
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

  createDeployment(projectId: number, environment: "staging" | "production", version: string) {
    const project = this.workspaceRepo.findProject(projectId);
    if (!project) {
      return null;
    }
    const data = this.workspaceRepo.read();
    const created = {
      id: this.workspaceRepo.nextId(data.deployments),
      projectId,
      environment,
      version,
      status: "success" as const,
      createdAt: nowIso()
    };
    this.workspaceRepo.appendDeployment(created);
    this.writeAudit("deployment_created", `deployment:${created.id}`, `${environment}@${version}`);
    return created;
  }

  getOpsMetrics() {
    const workspace = this.workspaceRepo.read();
    const deployTotal = workspace.deployments.length;
    const deploySuccess = workspace.deployments.filter((item) => item.status === "success").length;
    const activeShares = workspace.projectShares.filter((item) => new Date(item.expiresAt).getTime() > Date.now()).length;
    const latestAuditAt = workspace.auditLogs.length ? workspace.auditLogs[workspace.auditLogs.length - 1].createdAt : "";
    return {
      generatedAt: nowIso(),
      metrics: [
        { name: "deployment_success_rate", value: deployTotal === 0 ? 100 : Math.round((deploySuccess / deployTotal) * 100), unit: "%" },
        { name: "active_share_links", value: activeShares, unit: "count" },
        { name: "audit_events_total", value: workspace.auditLogs.length, unit: "count" }
      ],
      latestAuditAt
    };
  }
}
