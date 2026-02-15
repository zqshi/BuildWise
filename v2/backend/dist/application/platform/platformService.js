"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformService = void 0;
const platformSupport_1 = require("./platformSupport");
class PlatformService {
    constructor(workspaceRepo, modelRepo) {
        this.workspaceRepo = workspaceRepo;
        this.modelRepo = modelRepo;
    }
    writeAudit(action, resource, detail) {
        const workspace = this.workspaceRepo.read();
        this.workspaceRepo.appendAuditLog({
            id: this.workspaceRepo.nextId(workspace.auditLogs),
            actor: "system",
            action,
            resource,
            detail,
            createdAt: (0, platformSupport_1.nowIso)()
        });
    }
    listVersionSnapshots(projectId) {
        return this.workspaceRepo.listVersionSnapshots(projectId);
    }
    createVersionSnapshot(projectId, iterationId, name, note) {
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
            createdAt: (0, platformSupport_1.nowIso)()
        };
        this.workspaceRepo.appendVersionSnapshot(created);
        this.writeAudit("version_snapshot_created", `snapshot:${created.id}`, `${name} @ iteration:${iterationId}`);
        return created;
    }
    restoreVersionSnapshot(snapshotId) {
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
    listProjectShares(projectId) {
        return this.workspaceRepo.listProjectShares(projectId);
    }
    createProjectShare(projectId, permission, ttlHours) {
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
            token: (0, platformSupport_1.randomToken)("shr_"),
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
    runTemplate(templateId, projectId) {
        const template = this.listTemplates().find((item) => item.id === templateId);
        const project = this.workspaceRepo.findProject(projectId);
        if (!template || !project) {
            return null;
        }
        const createdAt = (0, platformSupport_1.nowIso)();
        const runId = (0, platformSupport_1.randomToken)("run_");
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
            parameters: {},
            status: "completed",
            startedAt: createdAt,
            finishedAt: createdAt,
            summary: result.summary
        });
        this.writeAudit("template_run_completed", `template:${templateId}`, `project:${projectId}`);
        return result;
    }
    runTemplateWithParams(templateId, projectId, parameters) {
        const template = this.listTemplates().find((item) => item.id === templateId);
        const project = this.workspaceRepo.findProject(projectId);
        if (!template || !project) {
            return null;
        }
        const startedAt = (0, platformSupport_1.nowIso)();
        const focused = parameters.focus || "默认目标";
        const summary = `已执行 ${template.name}，聚焦：${focused}`;
        const record = {
            runId: (0, platformSupport_1.randomToken)("run_"),
            templateId,
            projectId,
            status: "completed",
            startedAt,
            finishedAt: (0, platformSupport_1.nowIso)(),
            summary
        };
        const data = this.workspaceRepo.read();
        this.workspaceRepo.appendTemplateRun({
            id: this.workspaceRepo.nextId(data.templateRuns),
            runId: record.runId,
            templateId,
            projectId,
            parameters,
            status: "completed",
            startedAt: record.startedAt,
            finishedAt: record.finishedAt,
            summary: record.summary
        });
        this.writeAudit("template_run_completed", `template:${templateId}`, `params:${JSON.stringify(parameters)}`);
        return record;
    }
    listTemplateRuns(projectId) {
        return this.workspaceRepo.listTemplateRuns(projectId);
    }
    exportOpenApi() {
        const model = this.modelRepo.read();
        const paths = Object.fromEntries(model.apis
            .filter((item) => item.path)
            .map((item) => [
            item.path,
            {
                [(item.method || "GET").toLowerCase()]: {
                    summary: item.id || `Model endpoint ${item.path}`,
                    responses: { 200: { description: "OK" } }
                }
            }
        ]));
        return {
            openapi: "3.0.3",
            info: { title: "BuildWise API", version: "1.0.0" },
            paths
        };
    }
    listDeployments(projectId) {
        return this.workspaceRepo.listDeployments(projectId);
    }
    createDeployment(projectId, environment, version) {
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
            status: "queued",
            createdAt: (0, platformSupport_1.nowIso)()
        };
        this.workspaceRepo.appendDeployment(created);
        this.writeAudit("deployment_created", `deployment:${created.id}`, `${environment}@${version} status=queued`);
        return created;
    }
    transitionDeployment(deploymentId, toStatus) {
        const deployment = this.workspaceRepo.findDeployment(deploymentId);
        if (!deployment) {
            return { ok: false, reason: "deployment_not_found" };
        }
        const fromStatus = deployment.status;
        const allowed = platformSupport_1.deploymentTransitions[deployment.status] || [];
        if (!allowed.includes(toStatus)) {
            return { ok: false, reason: "invalid_transition" };
        }
        deployment.status = toStatus;
        this.workspaceRepo.updateDeployment(deployment);
        this.writeAudit("deployment_transitioned", `deployment:${deploymentId}`, `${fromStatus} -> ${toStatus}`);
        return { ok: true, data: deployment };
    }
    accessShare(token) {
        const share = this.workspaceRepo.findProjectShareByToken(token);
        if (!share) {
            return { ok: false, reason: "share_not_found" };
        }
        const expired = new Date(share.expiresAt).getTime() <= Date.now();
        if (expired) {
            return { ok: false, reason: "share_expired" };
        }
        const project = this.workspaceRepo.findProject(share.projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        const iterationCount = this.workspaceRepo.listIterations(share.projectId).length;
        return {
            ok: true,
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
    commentByShare(token, content) {
        const access = this.accessShare(token);
        if (!access.ok) {
            return access;
        }
        if (access.data.permission !== "comment") {
            return { ok: false, reason: "permission_denied" };
        }
        this.writeAudit("share_comment_added", `share:${token}`, content.slice(0, 120));
        return { ok: true, data: { ok: true, token, comment: content, createdAt: (0, platformSupport_1.nowIso)() } };
    }
    getOpsMetrics() {
        const workspace = this.workspaceRepo.read();
        const deployTotal = workspace.deployments.length;
        const deploySuccess = workspace.deployments.filter((item) => item.status === "success").length;
        const activeShares = workspace.projectShares.filter((item) => new Date(item.expiresAt).getTime() > Date.now()).length;
        const latestAuditAt = workspace.auditLogs.length ? workspace.auditLogs[workspace.auditLogs.length - 1].createdAt : "";
        return {
            generatedAt: (0, platformSupport_1.nowIso)(),
            metrics: [
                { name: "deployment_success_rate", value: deployTotal === 0 ? 100 : Math.round((deploySuccess / deployTotal) * 100), unit: "%" },
                { name: "active_share_links", value: activeShares, unit: "count" },
                { name: "audit_events_total", value: workspace.auditLogs.length, unit: "count" }
            ],
            latestAuditAt
        };
    }
}
exports.PlatformService = PlatformService;
