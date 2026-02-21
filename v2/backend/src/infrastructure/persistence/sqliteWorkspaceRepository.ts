import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AssessmentSnapshot,
  AuditLog,
  CreateIterationInput,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  Project,
  ProjectShare,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "../../domain/workspace/types";
import { nextThreePartVersion } from "../../domain/workspace/versioning";
import { SqliteWorkspaceCore, toRepoSlug } from "./sqliteWorkspaceCore";

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly core: SqliteWorkspaceCore;

  constructor(dbFile: string, seedDataFile?: string) {
    this.core = new SqliteWorkspaceCore(dbFile, seedDataFile);
  }

  read(): WorkspaceStore {
    return this.core.readStore();
  }

  write(data: WorkspaceStore) {
    this.core.writeStore(data);
  }

  nextId(items: { id: number }[]) {
    return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
  }

  listProjects() {
    return this.core.listProjects();
  }

  findProject(projectId: number) {
    return this.core.findProject(projectId);
  }

  createProject(input: Pick<Project, "name" | "description">) {
    const id = this.core.nextIdFromTable("projects");
    const repoName = toRepoSlug(input.name, `project-${id}`);
    const now = new Date().toISOString();
    const created: Project = {
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
      const items = this.core.readCollection<Project>("projects");
      items.push(created);
      this.core.writeCollection("projects", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listIterations(projectId: number) {
    return this.core.listIterations(projectId);
  }

  findIteration(iterationId: number) {
    return this.core.findIteration(iterationId);
  }

  findPreviousIteration(iteration: Iteration) {
    return this.core.findPreviousIteration(iteration);
  }

  createIteration(projectId: number, payload: CreateIterationInput) {
    const existing = this.core.listIterations(projectId);
    const version = nextThreePartVersion(existing, payload.versionType || "patch");
    const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [payload.name];
    const created: Iteration = {
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
      const items = this.core.readCollection<Iteration>("iterations");
      for (const item of items) {
        if (item.projectId === projectId) {
          item.current = false;
        }
      }
      items.push(created);
      this.core.writeCollection("iterations", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listMessages(iterationId: number) {
    return this.core.listMessages(iterationId);
  }

  createMessage(iterationId: number, role: IterationMessage["role"], content: string) {
    const created: IterationMessage = {
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
      const items = this.core.readCollection<IterationMessage>("messages");
      items.push(created);
      this.core.writeCollection("messages", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listSnapshots(iterationId: number) {
    return this.core.readCollection<AssessmentSnapshot>("snapshots").filter((item) => item.iterationId === iterationId);
  }

  listTransitions(iterationId: number) {
    return this.core.readCollection<IterationTransition>("transitions").filter((item) => item.iterationId === iterationId);
  }

  appendSnapshot(snapshot: AssessmentSnapshot) {
    const items = this.core.readCollection<AssessmentSnapshot>("snapshots");
    items.push(snapshot);
    this.core.writeCollection("snapshots", items);
  }

  appendTransition(transition: IterationTransition) {
    const items = this.core.readCollection<IterationTransition>("transitions");
    items.push(transition);
    this.core.writeCollection("transitions", items);
  }

  listAuditLogs(limit = 50) {
    return this.core.listAuditLogs(limit);
  }

  appendAuditLog(log: AuditLog) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.insertAuditLog(log);
      const items = this.core.readCollection<AuditLog>("auditLogs");
      items.push(log);
      this.core.writeCollection("auditLogs", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  listVersionSnapshots(projectId: number) {
    return this.core.readCollection<VersionSnapshot>("versionSnapshots").filter((item) => item.projectId === projectId);
  }

  appendVersionSnapshot(snapshot: VersionSnapshot) {
    const items = this.core.readCollection<VersionSnapshot>("versionSnapshots");
    items.push(snapshot);
    this.core.writeCollection("versionSnapshots", items);
  }

  findVersionSnapshot(snapshotId: number) {
    return this.core.readCollection<VersionSnapshot>("versionSnapshots").find((item) => item.id === snapshotId) ?? null;
  }

  listProjectShares(projectId: number) {
    return this.core.readCollection<ProjectShare>("projectShares").filter((item) => item.projectId === projectId);
  }

  findProjectShareByToken(token: string) {
    return this.core.readCollection<ProjectShare>("projectShares").find((item) => item.token === token) ?? null;
  }

  appendProjectShare(share: ProjectShare) {
    const items = this.core.readCollection<ProjectShare>("projectShares");
    items.push(share);
    this.core.writeCollection("projectShares", items);
  }

  listDeployments(projectId?: number) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    if (!projectId) {
      return items;
    }
    return items.filter((item) => item.projectId === projectId);
  }

  findDeployment(deploymentId: number) {
    return this.core.readCollection<DeploymentRecord>("deployments").find((item) => item.id === deploymentId) ?? null;
  }

  appendDeployment(record: DeploymentRecord) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    items.push(record);
    this.core.writeCollection("deployments", items);
  }

  updateDeployment(record: DeploymentRecord) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    const index = items.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      items[index] = record;
      this.core.writeCollection("deployments", items);
    }
  }

  listTemplateRuns(projectId?: number) {
    const runs = this.core.readCollection<TemplateRunRecord>("templateRuns");
    if (!projectId) {
      return runs;
    }
    return runs.filter((item) => item.projectId === projectId);
  }

  appendTemplateRun(record: TemplateRunRecord) {
    const items = this.core.readCollection<TemplateRunRecord>("templateRuns");
    items.push(record);
    this.core.writeCollection("templateRuns", items);
  }

  updateProject(project: Project) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.updateProject(project);
      const items = this.core.readCollection<Project>("projects");
      const idx = items.findIndex((item) => item.id === project.id);
      if (idx >= 0) {
        items[idx] = project;
      }
      this.core.writeCollection("projects", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  updateIteration(iteration: Iteration) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.updateIteration(iteration);
      const items = this.core.readCollection<Iteration>("iterations");
      const idx = items.findIndex((item) => item.id === iteration.id);
      if (idx >= 0) {
        items[idx] = iteration;
      }
      this.core.writeCollection("iterations", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
