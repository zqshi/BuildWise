import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AssessmentSnapshot,
  AuditLog,
  CreateIterationInput,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  OpsTriageTemplateRecord,
  ProjectPolicyRecord,
  ProjectWorkspaceBindingRecord,
  PolicyExecutionLogRecord,
  PlatformRoleBindingRecord,
  GovernanceCustomRoleRecord,
  ProjectRoleBindingRecord,
  ProjectShare,
  Project,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "../../domain/workspace/types";
import { nextThreePartVersion } from "../../domain/workspace/versioning";
import { toRepoSlug } from "../../domain/workspace/repositoryNaming";

const seedStore: WorkspaceStore = {
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
  opsTriageTemplates: [],
  projectPolicies: [],
  projectWorkspaceBindings: [],
  policyExecutionLogs: [],
  projectRoleBindings: [],
  platformRoleBindings: [],
  governanceCustomRoles: []
};

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export class JsonWorkspaceRepository implements WorkspaceRepository {
  private readonly dataFile: string;
  private writing = false;
  constructor(dataFile: string) {
    this.dataFile = dataFile;
  }

  read(): WorkspaceStore {
    if (!existsSync(this.dataFile)) {
      this.write(seedStore);
      return seedStore;
    }
    const raw = readFileSync(this.dataFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceStore>;
    return {
      projects: toArray<Project>(parsed.projects),
      iterations: toArray<Iteration>(parsed.iterations),
      messages: toArray<IterationMessage>(parsed.messages),
      snapshots: toArray<AssessmentSnapshot>(parsed.snapshots),
      transitions: toArray<IterationTransition>(parsed.transitions),
      auditLogs: toArray<AuditLog>(parsed.auditLogs),
      versionSnapshots: toArray<VersionSnapshot>(parsed.versionSnapshots),
      projectShares: toArray<ProjectShare>(parsed.projectShares),
      deployments: toArray<DeploymentRecord>(parsed.deployments),
      templateRuns: toArray<TemplateRunRecord>(parsed.templateRuns),
      opsTriageTemplates: toArray<OpsTriageTemplateRecord>(parsed.opsTriageTemplates),
      projectPolicies: toArray<ProjectPolicyRecord>(parsed.projectPolicies),
      projectWorkspaceBindings: toArray<ProjectWorkspaceBindingRecord>(parsed.projectWorkspaceBindings),
      policyExecutionLogs: toArray<PolicyExecutionLogRecord>(parsed.policyExecutionLogs),
      projectRoleBindings: toArray<ProjectRoleBindingRecord>(parsed.projectRoleBindings),
      platformRoleBindings: toArray<PlatformRoleBindingRecord>(parsed.platformRoleBindings),
      governanceCustomRoles: toArray<GovernanceCustomRoleRecord>(parsed.governanceCustomRoles)
    };
  }

  write(data: WorkspaceStore) {
    if (this.writing) {
      throw new Error("Concurrent write detected on JsonWorkspaceRepository");
    }
    this.writing = true;
    try {
      const tmpFile = `${this.dataFile}.tmp`;
      writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
      renameSync(tmpFile, this.dataFile);
    } finally {
      this.writing = false;
    }
  }

  nextId(items: { id: number }[]) {
    return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
  }

  listProjects() {
    return this.read().projects;
  }

  findProject(projectId: number) {
    return this.read().projects.find((item) => item.id === projectId) ?? null;
  }

  createProject(input: Pick<Project, "name" | "description">) {
    const data = this.read();
    const id = this.nextId(data.projects);
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
        repoMode: "hybrid",
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
        governance: {
          requireRemoteForProduction: true,
          requireRemoteForStaging: false
        },
        health: {
          remoteConfigured: false,
          remoteReachable: false,
          remoteSynced: false,
          lastCheckedAt: "",
          lastError: ""
        },
        createdAt: now,
        updatedAt: now
      }
    };
    data.projects.push(created);
    this.write(data);
    return created;
  }

  listIterations(projectId: number) {
    return this.read().iterations.filter((item) => item.projectId === projectId);
  }

  findIteration(iterationId: number) {
    return this.read().iterations.find((item) => item.id === iterationId) ?? null;
  }

  findPreviousIteration(iteration: Iteration) {
    return (
      this.read()
        .iterations
        .filter((item) => item.projectId === iteration.projectId && item.id < iteration.id)
        .sort((a, b) => b.id - a.id)[0] ?? null
    );
  }

  createIteration(projectId: number, payload: CreateIterationInput) {
    const data = this.read();
    const existing = data.iterations.filter((item) => item.projectId === projectId);
    const version = nextThreePartVersion(existing, payload.versionType || "patch");
    for (const item of existing) {
      item.current = false;
    }
    const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [payload.name];
    const created: Iteration = {
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

  listMessages(iterationId: number) {
    return this.read().messages.filter((item) => item.iterationId === iterationId);
  }

  createMessage(iterationId: number, role: IterationMessage["role"], content: string) {
    const data = this.read();
    const created: IterationMessage = {
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

  listSnapshots(iterationId: number) {
    return this.read().snapshots.filter((item) => item.iterationId === iterationId);
  }

  listTransitions(iterationId: number) {
    return this.read().transitions.filter((item) => item.iterationId === iterationId);
  }

  appendSnapshot(snapshot: AssessmentSnapshot) {
    const data = this.read();
    data.snapshots.push(snapshot);
    this.write(data);
  }

  appendTransition(transition: IterationTransition) {
    const data = this.read();
    data.transitions.push(transition);
    this.write(data);
  }

  listAuditLogs(limit = 50) {
    const logs = this.read().auditLogs;
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
    return logs.slice(-normalizedLimit).reverse();
  }

  appendAuditLog(log: AuditLog) {
    const data = this.read();
    data.auditLogs.push(log);
    this.write(data);
  }

  listVersionSnapshots(projectId: number) {
    return this.read().versionSnapshots.filter((item) => item.projectId === projectId);
  }

  appendVersionSnapshot(snapshot: VersionSnapshot) {
    const data = this.read();
    data.versionSnapshots.push(snapshot);
    this.write(data);
  }

  findVersionSnapshot(snapshotId: number) {
    return this.read().versionSnapshots.find((item) => item.id === snapshotId) ?? null;
  }

  listProjectShares(projectId: number) {
    return this.read().projectShares.filter((item) => item.projectId === projectId);
  }

  findProjectShareByToken(token: string) {
    return this.read().projectShares.find((item) => item.token === token) ?? null;
  }

  appendProjectShare(share: ProjectShare) {
    const data = this.read();
    data.projectShares.push(share);
    this.write(data);
  }

  listDeployments(projectId?: number) {
    const items = this.read().deployments;
    if (!projectId) {
      return items;
    }
    return items.filter((item) => item.projectId === projectId);
  }

  findDeployment(deploymentId: number) {
    return this.read().deployments.find((item) => item.id === deploymentId) ?? null;
  }

  appendDeployment(record: DeploymentRecord) {
    const data = this.read();
    data.deployments.push(record);
    this.write(data);
  }

  updateDeployment(record: DeploymentRecord) {
    const data = this.read();
    const index = data.deployments.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      data.deployments[index] = record;
      this.write(data);
    }
  }

  listTemplateRuns(projectId?: number) {
    const runs = this.read().templateRuns;
    if (!projectId) {
      return runs;
    }
    return runs.filter((item) => item.projectId === projectId);
  }

  appendTemplateRun(record: TemplateRunRecord) {
    const data = this.read();
    data.templateRuns.push(record);
    this.write(data);
  }

  listProjectPolicies(projectId: number) {
    return this.read().projectPolicies.filter((item) => item.projectId === projectId);
  }

  appendProjectPolicy(record: ProjectPolicyRecord) {
    const data = this.read();
    data.projectPolicies.push(record);
    this.write(data);
  }

  updateProjectPolicy(record: ProjectPolicyRecord) {
    const data = this.read();
    const idx = data.projectPolicies.findIndex((item) => item.id === record.id && item.projectId === record.projectId);
    if (idx >= 0) {
      data.projectPolicies[idx] = record;
      this.write(data);
    }
  }

  listProjectWorkspaceBindings(projectId: number) {
    return this.read().projectWorkspaceBindings.filter((item) => item.projectId === projectId);
  }

  upsertProjectWorkspaceBinding(record: ProjectWorkspaceBindingRecord) {
    const data = this.read();
    const idx = data.projectWorkspaceBindings.findIndex((item) => item.id === record.id || item.projectId === record.projectId);
    if (idx >= 0) {
      data.projectWorkspaceBindings[idx] = record;
    } else {
      data.projectWorkspaceBindings.push(record);
    }
    this.write(data);
    return record;
  }

  listPolicyExecutionLogs(iterationId: number) {
    return this.read().policyExecutionLogs.filter((item) => item.iterationId === iterationId);
  }

  appendPolicyExecutionLog(record: PolicyExecutionLogRecord) {
    const data = this.read();
    data.policyExecutionLogs.push(record);
    this.write(data);
  }

  listProjectRoleBindings(projectId: number) {
    return this.read().projectRoleBindings.filter((item) => item.projectId === projectId);
  }

  upsertProjectRoleBinding(record: ProjectRoleBindingRecord) {
    const data = this.read();
    const idx = data.projectRoleBindings.findIndex((item) => item.projectId === record.projectId && item.userId === record.userId);
    if (idx >= 0) {
      data.projectRoleBindings[idx] = record;
    } else {
      data.projectRoleBindings.push(record);
    }
    this.write(data);
    return record;
  }

  removeProjectRoleBinding(projectId: number, userId: string) {
    const data = this.read();
    const before = data.projectRoleBindings.length;
    data.projectRoleBindings = data.projectRoleBindings.filter(
      (item) => !(item.projectId === projectId && item.userId === userId)
    );
    if (data.projectRoleBindings.length === before) {
      return false;
    }
    this.write(data);
    return true;
  }

  listPlatformRoleBindings() {
    return this.read().platformRoleBindings;
  }

  upsertPlatformRoleBinding(record: PlatformRoleBindingRecord) {
    const data = this.read();
    const idx = data.platformRoleBindings.findIndex((item) => item.userId === record.userId);
    if (idx >= 0) {
      data.platformRoleBindings[idx] = record;
    } else {
      data.platformRoleBindings.push(record);
    }
    this.write(data);
    return record;
  }

  removePlatformRoleBinding(userId: string) {
    const data = this.read();
    const before = data.platformRoleBindings.length;
    data.platformRoleBindings = data.platformRoleBindings.filter((item) => item.userId !== userId);
    if (data.platformRoleBindings.length === before) {
      return false;
    }
    this.write(data);
    return true;
  }

  listGovernanceCustomRoles() {
    return this.read().governanceCustomRoles;
  }

  upsertGovernanceCustomRole(record: GovernanceCustomRoleRecord) {
    const data = this.read();
    const idx = data.governanceCustomRoles.findIndex((item) => item.roleKey === record.roleKey);
    if (idx >= 0) {
      data.governanceCustomRoles[idx] = record;
    } else {
      data.governanceCustomRoles.push(record);
    }
    this.write(data);
    return record;
  }

  removeGovernanceCustomRole(roleKey: string) {
    const data = this.read();
    const before = data.governanceCustomRoles.length;
    data.governanceCustomRoles = data.governanceCustomRoles.filter((item) => item.roleKey !== roleKey);
    if (data.governanceCustomRoles.length === before) {
      return false;
    }
    this.write(data);
    return true;
  }

  updateProject(project: Project) {
    const data = this.read();
    const idx = data.projects.findIndex((item) => item.id === project.id);
    if (idx >= 0) {
      data.projects[idx] = project;
      this.write(data);
    }
  }

  updateIteration(iteration: Iteration) {
    const data = this.read();
    const idx = data.iterations.findIndex((item) => item.id === iteration.id);
    if (idx >= 0) {
      data.iterations[idx] = iteration;
      this.write(data);
    }
  }
}
