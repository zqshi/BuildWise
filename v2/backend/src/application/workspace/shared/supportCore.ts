import type {
  AttachmentAnalysisReport,
  CreateIterationInput,
  Iteration,
  IterationStatus,
  Project,
  VersionAssessment
} from '../../../domain/workspace/types';
import { canTransitionTo, allowedTransitionsFrom, suggestNextTransition } from '../../../domain/workspace/iterationStateMachine';

const iterationStatuses: IterationStatus[] = ["planned", "in-progress", "review", "blocked", "completed"];

export function isIterationStatus(value: string): value is IterationStatus {
  return (iterationStatuses as string[]).includes(value);
}

export { canTransitionTo, allowedTransitionsFrom, suggestNextTransition };

export function recomputeAssessment(current: Iteration, previous: Iteration | null): VersionAssessment {
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

function mergeList(primary: string[] | undefined, fallback: string[]) {
  if (Array.isArray(primary) && primary.length > 0) {
    return primary;
  }
  return fallback;
}
export function buildMergedIterationPayload(
  payload: CreateIterationInput,
  project: Project | null,
  previous: Iteration | null
) {
  const goals = mergeList(payload.goals, previous?.goals?.length ? previous.goals : [payload.name]);
  const scope = {
    inScope: mergeList(payload.scope?.inScope, previous?.scope?.inScope ?? goals),
    outOfScope: mergeList(payload.scope?.outOfScope, previous?.scope?.outOfScope ?? []),
    acceptanceCriteria: mergeList(
      payload.scope?.acceptanceCriteria,
      previous?.scope?.acceptanceCriteria ?? goals.map((goal) => `${goal} 可演示并通过验收`)
    )
  };
  const continuity = {
    inheritedFromIterationId: previous?.id ?? null,
    inheritedSummary: previous
      ? `继承自 ${previous.name}，并导入项目元信息：${project?.name ?? "未知项目"}`
      : "首个迭代，无需继承。",
    carriedGoals: previous?.assessment.pendingItems?.length ? previous.assessment.pendingItems : previous?.goals ?? [],
    carriedRisks: previous?.assessment.risks ?? [],
    carriedDecisions: previous
      ? [...(previous.continuity.carriedDecisions ?? []), `项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`]
      : [`项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`]
  };
  const assessment = {
    baselineIterationId: previous?.id ?? null,
    baselineIterationName: previous?.name ?? "无基线",
    currentSummary:
      payload.aiSummary?.trim() || `基于项目「${project?.name ?? "未命名项目"}」元信息，${payload.name} 继承上版本上下文并进入执行。`,
    deltaInScope: [
      ...scope.inScope.filter((item) => !(previous?.scope.inScope ?? []).includes(item)).map((item) => `+ ${item}`),
      ...(previous?.scope.inScope ?? []).filter((item) => !scope.inScope.includes(item)).map((item) => `- ${item}`)
    ],
    resolvedItems: previous?.scope.inScope.filter((item) => !scope.inScope.includes(item)) ?? [],
    pendingItems: scope.inScope,
    risks: previous?.assessment.risks ?? []
  };
  return {
    ...payload,
    goals,
    scope,
    continuity,
    assessment,
    aiSummary: assessment.currentSummary
  };
}
export function buildDiffLocations(previous: Iteration | null, current: Iteration) {
  const diffLocations: AttachmentAnalysisReport["diffLocations"] = [];
  const pushDimensionDiff = (
    dimension: "goals" | "inScope" | "outOfScope" | "acceptanceCriteria",
    baseline: string[],
    target: string[]
  ) => {
    for (const item of target.filter((value) => !baseline.includes(value))) {
      diffLocations.push({ dimension, changeType: "added", currentItem: item });
    }
    for (const item of baseline.filter((value) => !target.includes(value))) {
      diffLocations.push({ dimension, changeType: "removed", currentItem: item, baselineItem: item });
    }
  };
  pushDimensionDiff("goals", previous?.goals ?? [], current.goals ?? []);
  pushDimensionDiff("inScope", previous?.scope.inScope ?? [], current.scope.inScope ?? []);
  pushDimensionDiff("outOfScope", previous?.scope.outOfScope ?? [], current.scope.outOfScope ?? []);
  pushDimensionDiff("acceptanceCriteria", previous?.scope.acceptanceCriteria ?? [], current.scope.acceptanceCriteria ?? []);
  return diffLocations;
}
