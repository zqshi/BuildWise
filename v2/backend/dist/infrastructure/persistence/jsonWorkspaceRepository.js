"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonWorkspaceRepository = void 0;
const node_fs_1 = require("node:fs");
const versioning_1 = require("../../domain/workspace/versioning");
const seedStore = {
    projects: [
        {
            id: 1,
            name: "构想智造平台",
            description: "统一项目模型驱动的迭代管理平台",
            status: "in-progress",
            icon: "cubes",
            iconColor: "blue",
            lastUpdated: new Date().toISOString().slice(0, 10)
        }
    ],
    iterations: [],
    messages: [],
    snapshots: [],
    transitions: [],
    auditLogs: [],
    versionSnapshots: [],
    projectShares: [],
    deployments: [],
    templateRuns: [],
    opsTriageTemplates: []
};
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function toRepoSlug(value, fallback) {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}
class JsonWorkspaceRepository {
    constructor(dataFile) {
        this.dataFile = dataFile;
    }
    read() {
        if (!(0, node_fs_1.existsSync)(this.dataFile)) {
            this.write(seedStore);
            return seedStore;
        }
        const raw = (0, node_fs_1.readFileSync)(this.dataFile, "utf-8");
        const parsed = JSON.parse(raw);
        return {
            projects: toArray(parsed.projects),
            iterations: toArray(parsed.iterations),
            messages: toArray(parsed.messages),
            snapshots: toArray(parsed.snapshots),
            transitions: toArray(parsed.transitions),
            auditLogs: toArray(parsed.auditLogs),
            versionSnapshots: toArray(parsed.versionSnapshots),
            projectShares: toArray(parsed.projectShares),
            deployments: toArray(parsed.deployments),
            templateRuns: toArray(parsed.templateRuns),
            opsTriageTemplates: toArray(parsed.opsTriageTemplates)
        };
    }
    write(data) {
        (0, node_fs_1.writeFileSync)(this.dataFile, JSON.stringify(data, null, 2), "utf-8");
    }
    nextId(items) {
        return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
    }
    listProjects() {
        return this.read().projects;
    }
    findProject(projectId) {
        return this.read().projects.find((item) => item.id === projectId) ?? null;
    }
    createProject(input) {
        const data = this.read();
        const id = this.nextId(data.projects);
        const repoName = toRepoSlug(input.name, `project-${id}`);
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
        data.projects.push(created);
        this.write(data);
        return created;
    }
    listIterations(projectId) {
        return this.read().iterations.filter((item) => item.projectId === projectId);
    }
    findIteration(iterationId) {
        return this.read().iterations.find((item) => item.id === iterationId) ?? null;
    }
    findPreviousIteration(iteration) {
        return (this.read()
            .iterations
            .filter((item) => item.projectId === iteration.projectId && item.id < iteration.id)
            .sort((a, b) => b.id - a.id)[0] ?? null);
    }
    createIteration(projectId, payload) {
        const data = this.read();
        const existing = data.iterations.filter((item) => item.projectId === projectId);
        const version = (0, versioning_1.nextThreePartVersion)(existing, payload.versionType || "patch");
        for (const item of existing) {
            item.current = false;
        }
        const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [payload.name];
        const created = {
            id: this.nextId(data.iterations),
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
        data.iterations.push(created);
        this.write(data);
        return created;
    }
    listMessages(iterationId) {
        return this.read().messages.filter((item) => item.iterationId === iterationId);
    }
    createMessage(iterationId, role, content) {
        const data = this.read();
        const created = {
            id: this.nextId(data.messages),
            iterationId,
            role,
            content,
            createdAt: new Date().toISOString()
        };
        data.messages.push(created);
        this.write(data);
        return created;
    }
    listSnapshots(iterationId) {
        return this.read().snapshots.filter((item) => item.iterationId === iterationId);
    }
    listTransitions(iterationId) {
        return this.read().transitions.filter((item) => item.iterationId === iterationId);
    }
    appendSnapshot(snapshot) {
        const data = this.read();
        data.snapshots.push(snapshot);
        this.write(data);
    }
    appendTransition(transition) {
        const data = this.read();
        data.transitions.push(transition);
        this.write(data);
    }
    listAuditLogs(limit = 50) {
        const logs = this.read().auditLogs;
        const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
        return logs.slice(-normalizedLimit).reverse();
    }
    appendAuditLog(log) {
        const data = this.read();
        data.auditLogs.push(log);
        this.write(data);
    }
    listVersionSnapshots(projectId) {
        return this.read().versionSnapshots.filter((item) => item.projectId === projectId);
    }
    appendVersionSnapshot(snapshot) {
        const data = this.read();
        data.versionSnapshots.push(snapshot);
        this.write(data);
    }
    findVersionSnapshot(snapshotId) {
        return this.read().versionSnapshots.find((item) => item.id === snapshotId) ?? null;
    }
    listProjectShares(projectId) {
        return this.read().projectShares.filter((item) => item.projectId === projectId);
    }
    findProjectShareByToken(token) {
        return this.read().projectShares.find((item) => item.token === token) ?? null;
    }
    appendProjectShare(share) {
        const data = this.read();
        data.projectShares.push(share);
        this.write(data);
    }
    listDeployments(projectId) {
        const items = this.read().deployments;
        if (!projectId) {
            return items;
        }
        return items.filter((item) => item.projectId === projectId);
    }
    findDeployment(deploymentId) {
        return this.read().deployments.find((item) => item.id === deploymentId) ?? null;
    }
    appendDeployment(record) {
        const data = this.read();
        data.deployments.push(record);
        this.write(data);
    }
    updateDeployment(record) {
        const data = this.read();
        const index = data.deployments.findIndex((item) => item.id === record.id);
        if (index >= 0) {
            data.deployments[index] = record;
            this.write(data);
        }
    }
    listTemplateRuns(projectId) {
        const runs = this.read().templateRuns;
        if (!projectId) {
            return runs;
        }
        return runs.filter((item) => item.projectId === projectId);
    }
    appendTemplateRun(record) {
        const data = this.read();
        data.templateRuns.push(record);
        this.write(data);
    }
    updateProject(project) {
        const data = this.read();
        const idx = data.projects.findIndex((item) => item.id === project.id);
        if (idx >= 0) {
            data.projects[idx] = project;
            this.write(data);
        }
    }
    updateIteration(iteration) {
        const data = this.read();
        const idx = data.iterations.findIndex((item) => item.id === iteration.id);
        if (idx >= 0) {
            data.iterations[idx] = iteration;
            this.write(data);
        }
    }
}
exports.JsonWorkspaceRepository = JsonWorkspaceRepository;
