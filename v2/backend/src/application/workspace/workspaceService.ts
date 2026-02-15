import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  AssessmentPayload,
  AssessmentSnapshot,
  ContinuityMeta,
  Iteration,
  IterationContextPayload,
  IterationScope,
  VersionAssessment
} from "../../domain/workspace/types";

function fallbackScope(goals: string[]): IterationScope {
  return {
    inScope: goals,
    outOfScope: [],
    acceptanceCriteria: goals.map((goal) => `${goal} 可演示并通过验收`)
  };
}

function fallbackContinuity(): ContinuityMeta {
  return {
    inheritedFromIterationId: null,
    inheritedSummary: "首个迭代，无需继承。",
    carriedGoals: [],
    carriedRisks: [],
    carriedDecisions: []
  };
}

function fallbackAssessment(scope: IterationScope, summary: string): VersionAssessment {
  return {
    baselineIterationId: null,
    baselineIterationName: "无基线",
    currentSummary: summary,
    deltaInScope: scope.inScope,
    resolvedItems: [],
    pendingItems: scope.inScope,
    risks: []
  };
}

function normalizeIteration(iteration: Iteration): Iteration {
  const goals = Array.isArray(iteration.goals) ? iteration.goals : [];
  const scope = iteration.scope ?? fallbackScope(goals);
  const continuity = iteration.continuity ?? fallbackContinuity();
  const summary = iteration.aiSummary || `${iteration.name} 进入执行阶段`;
  const assessment = iteration.assessment ?? fallbackAssessment(scope, summary);
  return {
    ...iteration,
    goals,
    modules: Array.isArray(iteration.modules) ? iteration.modules : [],
    scope: {
      inScope: Array.isArray(scope.inScope) ? scope.inScope : [],
      outOfScope: Array.isArray(scope.outOfScope) ? scope.outOfScope : [],
      acceptanceCriteria: Array.isArray(scope.acceptanceCriteria) ? scope.acceptanceCriteria : []
    },
    continuity: {
      inheritedFromIterationId: continuity.inheritedFromIterationId ?? null,
      inheritedSummary: continuity.inheritedSummary || "",
      carriedGoals: Array.isArray(continuity.carriedGoals) ? continuity.carriedGoals : [],
      carriedRisks: Array.isArray(continuity.carriedRisks) ? continuity.carriedRisks : [],
      carriedDecisions: Array.isArray(continuity.carriedDecisions) ? continuity.carriedDecisions : []
    },
    assessment: {
      baselineIterationId: assessment.baselineIterationId ?? null,
      baselineIterationName: assessment.baselineIterationName || "无基线",
      currentSummary: assessment.currentSummary || "",
      deltaInScope: Array.isArray(assessment.deltaInScope) ? assessment.deltaInScope : [],
      resolvedItems: Array.isArray(assessment.resolvedItems) ? assessment.resolvedItems : [],
      pendingItems: Array.isArray(assessment.pendingItems) ? assessment.pendingItems : [],
      risks: Array.isArray(assessment.risks) ? assessment.risks : []
    }
  };
}

function recomputeAssessment(current: Iteration, previous: Iteration | null): VersionAssessment {
  const prevScope = previous?.scope.inScope ?? [];
  const currScope = current.scope.inScope;
  const deltaInScope = [
    ...currScope.filter((item) => !prevScope.includes(item)).map((item) => `+ ${item}`),
    ...prevScope.filter((item) => !currScope.includes(item)).map((item) => `- ${item}`)
  ];
  return {
    baselineIterationId: previous?.id ?? null,
    baselineIterationName: previous?.name ?? "无基线",
    currentSummary: current.assessment.currentSummary || current.aiSummary || "当前迭代已定义范围，待执行交付。",
    deltaInScope,
    resolvedItems: previous ? prevScope.filter((item) => !currScope.includes(item)) : [],
    pendingItems: currScope,
    risks: current.continuity.carriedRisks
  };
}

function summarizeFromExcerpt(excerpt: string, fallback: string) {
  const clean = excerpt.replace(/\s+/g, " ").trim();
  if (!clean) {
    return fallback;
  }
  return `已解析附件片段，关键内容：${clean.slice(0, 120)}${clean.length > 120 ? "..." : ""}`;
}

function inferRisksFromExcerpt(excerpt: string) {
  const lowered = excerpt.toLowerCase();
  const risks: string[] = [];
  if (lowered.includes("延期") || lowered.includes("delay")) {
    risks.push("附件提及进度风险，建议补充里程碑缓冲。");
  }
  if (lowered.includes("待确认") || lowered.includes("todo")) {
    risks.push("附件存在待确认项，建议在版本评审前补齐决策。");
  }
  return risks;
}

export class WorkspaceService {
  constructor(private readonly repo: WorkspaceRepository) {}

  hasProject(projectId: number) {
    return this.repo.findProject(projectId) !== null;
  }

  listProjects() {
    return this.repo.listProjects();
  }

  createProject(input: { name: string; description: string }) {
    return this.repo.createProject(input);
  }

  listIterations(projectId: number) {
    if (!this.hasProject(projectId)) {
      return null;
    }
    return this.repo.listIterations(projectId).map(normalizeIteration);
  }

  createIteration(projectId: number, payload: Partial<Iteration> & Pick<Iteration, "name" | "description">) {
    if (!this.hasProject(projectId)) {
      return null;
    }
    const created = this.repo.createIteration(projectId, payload);
    const normalized = normalizeIteration(created);
    const snapshot: AssessmentSnapshot = {
      id: this.repo.nextId(this.repo.read().snapshots),
      iterationId: normalized.id,
      source: "create",
      note: "迭代创建自动快照",
      assessment: normalized.assessment,
      scope: normalized.scope,
      status: normalized.status,
      progress: normalized.progress,
      createdAt: new Date().toISOString()
    };
    this.repo.appendSnapshot(snapshot);
    return normalized;
  }

  listMessages(iterationId: number) {
    return this.repo.listMessages(iterationId);
  }

  createMessage(iterationId: number, role: "system" | "assistant" | "user", content: string) {
    const created = this.repo.createMessage(iterationId, role, content);
    const iteration = this.repo.findIteration(iterationId);
    if (iteration) {
      const snapshot: AssessmentSnapshot = {
        id: this.repo.nextId(this.repo.read().snapshots),
        iterationId,
        source: "message",
        note: `${role} 消息更新`,
        assessment: iteration.assessment,
        scope: iteration.scope,
        status: iteration.status,
        progress: iteration.progress,
        createdAt: new Date().toISOString()
      };
      this.repo.appendSnapshot(snapshot);
    }
    return created;
  }

  getIterationContext(iterationId: number): IterationContextPayload | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const normalized = normalizeIteration(iteration);
    const previous = this.repo.findPreviousIteration(normalized);
    return {
      iteration: normalized,
      previous: previous ? normalizeIteration(previous) : null,
      continuity: normalized.continuity,
      scope: normalized.scope
    };
  }

  getAssessment(iterationId: number): AssessmentPayload | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const normalized = normalizeIteration(iteration);
    return {
      iterationId: normalized.id,
      iterationName: normalized.name,
      assessment: normalized.assessment
    };
  }

  listAssessmentSnapshots(iterationId: number) {
    return this.repo.listSnapshots(iterationId);
  }

  recomputeAssessment(iterationId: number): AssessmentPayload | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const previous = this.repo.findPreviousIteration(iteration);
    const normalized = normalizeIteration(iteration);
    normalized.assessment = recomputeAssessment(normalized, previous ? normalizeIteration(previous) : null);
    this.repo.updateIteration(normalized);
    this.repo.appendSnapshot({
      id: this.repo.nextId(this.repo.read().snapshots),
      iterationId,
      source: "manual-recompute",
      note: "手动刷新评估",
      assessment: normalized.assessment,
      scope: normalized.scope,
      status: normalized.status,
      progress: normalized.progress,
      createdAt: new Date().toISOString()
    });
    return {
      iterationId,
      iterationName: normalized.name,
      assessment: normalized.assessment
    };
  }

  restoreSnapshot(iterationId: number, snapshotId: number): AssessmentPayload | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const snapshot = this.repo.listSnapshots(iterationId).find((item) => item.id === snapshotId);
    if (!snapshot) {
      return null;
    }
    const normalized = normalizeIteration(iteration);
    normalized.assessment = snapshot.assessment;
    normalized.scope = snapshot.scope;
    normalized.status = snapshot.status;
    normalized.progress = snapshot.progress;
    this.repo.updateIteration(normalized);
    this.repo.appendSnapshot({
      id: this.repo.nextId(this.repo.read().snapshots),
      iterationId,
      source: "restore",
      note: `恢复快照 #${snapshotId}`,
      assessment: normalized.assessment,
      scope: normalized.scope,
      status: normalized.status,
      progress: normalized.progress,
      createdAt: new Date().toISOString()
    });
    return {
      iterationId,
      iterationName: normalized.name,
      assessment: normalized.assessment
    };
  }

  analyzeAttachment(iterationId: number, input: AttachmentUploadInput): AttachmentAnalysisReport | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const normalized = normalizeIteration(iteration);
    const previous = this.repo.findPreviousIteration(normalized);
    const previousScope = previous?.scope.inScope ?? [];
    const currentScope = normalized.scope.inScope;
    const added = currentScope.filter((item) => !previousScope.includes(item));
    const removed = previousScope.filter((item) => !currentScope.includes(item));
    const changed = normalized.assessment.deltaInScope.filter((item) => item.startsWith("+") || item.startsWith("-"));
    const inferredRisks = inferRisksFromExcerpt(input.excerpt);

    return {
      iterationId: normalized.id,
      iterationName: normalized.name,
      fileName: input.fileName,
      analyzedAt: new Date().toISOString(),
      understanding: `${summarizeFromExcerpt(
        input.excerpt,
        `已基于附件 ${input.fileName} 与当前迭代上下文完成语义理解。`
      )} 识别到 ${added.length} 项新增范围、${removed.length} 项移出范围。`,
      versionDiff: {
        baselineIterationName: previous?.name ?? "无基线",
        added,
        changed,
        removed
      },
      risks:
        normalized.assessment.risks.length > 0
          ? normalized.assessment.risks
          : inferredRisks.length > 0
            ? inferredRisks
            : ["暂无显式风险，请结合业务验收继续确认。"],
      suggestions: [
        "优先处理新增范围中的高业务价值项。",
        "将差异项同步到验收标准，避免交付偏差。",
        "评估被移出范围是否影响当前里程碑承诺。"
      ]
    };
  }
}
