"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteWorkspaceRepository = void 0;
const versioning_1 = require("../../domain/workspace/versioning");
const sqliteWorkspaceCore_1 = require("./sqliteWorkspaceCore");
class SqliteWorkspaceRepository {
    constructor(dbFile, seedDataFile) {
        this.core = new sqliteWorkspaceCore_1.SqliteWorkspaceCore(dbFile, seedDataFile);
    }
    read() {
        return this.core.readStore();
    }
    write(data) {
        this.core.writeStore(data);
    }
    nextId(items) {
        return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
    }
    listProjects() {
        return this.core.listProjects();
    }
    findProject(projectId) {
        return this.core.findProject(projectId);
    }
    createProject(input) {
        const id = this.core.nextIdFromTable("projects");
        const repoName = (0, sqliteWorkspaceCore_1.toRepoSlug)(input.name, `project-${id}`);
        const now = new Date().toISOString();
        const created = {
            id,
            name: input.name,
            description: input.description,
            status: "in-progress",
            lastUpdated: now.slice(0, 10),
            repository: {
                id: `repo-${id}`,
                provider: "github",
                organization: "buildwise",
                name: repoName,
                url: `https://github.com/buildwise/${repoName}`,
                defaultBranch: "main",
                structureVersion: "v1",
                layout: [
                    { path: "apps/web", purpose: "前端应用", required: true },
                    { path: "apps/api", purpose: "后端服务", required: true },
                    { path: "packages/domain", purpose: "领域模型与用例", required: true },
                    { path: "packages/shared", purpose: "跨端共享模块", required: false },
                    { path: "docs", purpose: "PRD/ADR/迭代记录", required: true },
                    { path: "tests", purpose: "集成与契约测试", required: true },
                    { path: "infra", purpose: "部署与环境脚本", required: true },
                    { path: ".github/workflows", purpose: "CI/CD 流水线", required: true }
                ],
                remote: {
                    status: "unprovisioned",
                    visibility: "private",
                    ownerType: "org",
                    providerRepoId: "",
                    htmlUrl: "",
                    cloneUrl: "",
                    sshUrl: "",
                    lastProvisionedAt: ""
                },
                createdAt: now,
                updatedAt: now
            }
        };
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.insertProject(created);
            const items = this.core.readCollection("projects");
            items.push(created);
            this.core.writeCollection("projects", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
        return created;
    }
    listIterations(projectId) {
        return this.core.listIterations(projectId);
    }
    findIteration(iterationId) {
        return this.core.findIteration(iterationId);
    }
    findPreviousIteration(iteration) {
        return this.core.findPreviousIteration(iteration);
    }
    createIteration(projectId, payload) {
        const existing = this.core.listIterations(projectId);
        const version = (0, versioning_1.nextThreePartVersion)(existing, payload.versionType || "patch");
        const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [payload.name];
        const created = {
            id: this.core.nextIdFromTable("iterations"),
            projectId,
            version,
            name: payload.name,
            description: payload.description,
            goals,
            modules: goals.map((goal, idx) => ({
                id: `module-${Date.now()}-${idx}`,
                title: goal,
                status: "planned"
            })),
            status: "in-progress",
            progress: 0,
            createdAt: new Date().toISOString().slice(0, 10),
            createdBy: "系统",
            current: true,
            aiSummary: payload.aiSummary || `基于项目目标，${payload.name} 进入执行。`,
            scope: payload.scope ?? {
                inScope: goals,
                outOfScope: [],
                acceptanceCriteria: goals.map((goal) => `${goal} 可演示并通过验收`)
            },
            continuity: payload.continuity ?? {
                inheritedFromIterationId: existing.length > 0 ? existing[existing.length - 1].id : null,
                inheritedSummary: existing.length > 0 ? `继承 ${existing[existing.length - 1].name}` : "首个迭代，无需继承。",
                carriedGoals: [],
                carriedRisks: [],
                carriedDecisions: []
            },
            assessment: payload.assessment ?? {
                baselineIterationId: existing.length > 0 ? existing[existing.length - 1].id : null,
                baselineIterationName: existing.length > 0 ? existing[existing.length - 1].name : "无基线",
                currentSummary: payload.aiSummary || `${payload.name} 进入执行阶段`,
                deltaInScope: goals.map((goal) => `+ ${goal}`),
                resolvedItems: [],
                pendingItems: goals,
                risks: []
            }
        };
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.clearProjectCurrentIterations(projectId);
            this.core.insertIteration(created);
            const items = this.core.readCollection("iterations");
            for (const item of items) {
                if (item.projectId === projectId) {
                    item.current = false;
                }
            }
            items.push(created);
            this.core.writeCollection("iterations", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
        return created;
    }
    listMessages(iterationId) {
        return this.core.listMessages(iterationId);
    }
    createMessage(iterationId, role, content) {
        const created = {
            id: this.core.nextIdFromTable("messages"),
            iterationId,
            role,
            content,
            createdAt: new Date().toISOString()
        };
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.insertMessage(created);
            const items = this.core.readCollection("messages");
            items.push(created);
            this.core.writeCollection("messages", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
        return created;
    }
    listSnapshots(iterationId) {
        return this.core.readCollection("snapshots").filter((item) => item.iterationId === iterationId);
    }
    listTransitions(iterationId) {
        return this.core.readCollection("transitions").filter((item) => item.iterationId === iterationId);
    }
    appendSnapshot(snapshot) {
        const items = this.core.readCollection("snapshots");
        items.push(snapshot);
        this.core.writeCollection("snapshots", items);
    }
    appendTransition(transition) {
        const items = this.core.readCollection("transitions");
        items.push(transition);
        this.core.writeCollection("transitions", items);
    }
    listAuditLogs(limit = 50) {
        return this.core.listAuditLogs(limit);
    }
    appendAuditLog(log) {
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.insertAuditLog(log);
            const items = this.core.readCollection("auditLogs");
            items.push(log);
            this.core.writeCollection("auditLogs", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }
    listVersionSnapshots(projectId) {
        return this.core.readCollection("versionSnapshots").filter((item) => item.projectId === projectId);
    }
    appendVersionSnapshot(snapshot) {
        const items = this.core.readCollection("versionSnapshots");
        items.push(snapshot);
        this.core.writeCollection("versionSnapshots", items);
    }
    findVersionSnapshot(snapshotId) {
        return this.core.readCollection("versionSnapshots").find((item) => item.id === snapshotId) ?? null;
    }
    listProjectShares(projectId) {
        return this.core.readCollection("projectShares").filter((item) => item.projectId === projectId);
    }
    findProjectShareByToken(token) {
        return this.core.readCollection("projectShares").find((item) => item.token === token) ?? null;
    }
    appendProjectShare(share) {
        const items = this.core.readCollection("projectShares");
        items.push(share);
        this.core.writeCollection("projectShares", items);
    }
    listDeployments(projectId) {
        const items = this.core.readCollection("deployments");
        if (!projectId) {
            return items;
        }
        return items.filter((item) => item.projectId === projectId);
    }
    findDeployment(deploymentId) {
        return this.core.readCollection("deployments").find((item) => item.id === deploymentId) ?? null;
    }
    appendDeployment(record) {
        const items = this.core.readCollection("deployments");
        items.push(record);
        this.core.writeCollection("deployments", items);
    }
    updateDeployment(record) {
        const items = this.core.readCollection("deployments");
        const index = items.findIndex((item) => item.id === record.id);
        if (index >= 0) {
            items[index] = record;
            this.core.writeCollection("deployments", items);
        }
    }
    listTemplateRuns(projectId) {
        const runs = this.core.readCollection("templateRuns");
        if (!projectId) {
            return runs;
        }
        return runs.filter((item) => item.projectId === projectId);
    }
    appendTemplateRun(record) {
        const items = this.core.readCollection("templateRuns");
        items.push(record);
        this.core.writeCollection("templateRuns", items);
    }
    updateProject(project) {
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.updateProject(project);
            const items = this.core.readCollection("projects");
            const idx = items.findIndex((item) => item.id === project.id);
            if (idx >= 0) {
                items[idx] = project;
            }
            this.core.writeCollection("projects", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }
    updateIteration(iteration) {
        const db = this.core.db;
        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            this.core.updateIteration(iteration);
            const items = this.core.readCollection("iterations");
            const idx = items.findIndex((item) => item.id === iteration.id);
            if (idx >= 0) {
                items[idx] = iteration;
            }
            this.core.writeCollection("iterations", items);
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }
}
exports.SqliteWorkspaceRepository = SqliteWorkspaceRepository;
