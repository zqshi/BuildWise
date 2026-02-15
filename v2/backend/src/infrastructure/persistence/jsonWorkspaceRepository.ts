import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AssessmentSnapshot,
  Iteration,
  IterationMessage,
  Project,
  WorkspaceStore
} from "../../domain/workspace/types";

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
  snapshots: []
};

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export class JsonWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly dataFile: string) {}

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
      snapshots: toArray<AssessmentSnapshot>(parsed.snapshots)
    };
  }

  write(data: WorkspaceStore) {
    writeFileSync(this.dataFile, JSON.stringify(data, null, 2), "utf-8");
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
    const created: Project = {
      id: this.nextId(data.projects),
      name: input.name,
      description: input.description,
      status: "in-progress",
      lastUpdated: new Date().toISOString().slice(0, 10)
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

  createIteration(projectId: number, payload: Partial<Iteration> & Pick<Iteration, "name" | "description">) {
    const data = this.read();
    const existing = data.iterations.filter((item) => item.projectId === projectId);
    for (const item of existing) {
      item.current = false;
    }
    const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [payload.name];
    const created: Iteration = {
      id: this.nextId(data.iterations),
      projectId,
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

  appendSnapshot(snapshot: AssessmentSnapshot) {
    const data = this.read();
    data.snapshots.push(snapshot);
    this.write(data);
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
