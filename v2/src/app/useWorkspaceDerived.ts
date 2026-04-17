import { useMemo } from "react";
import type { Iteration, Project } from "../domain/workspace/types";
import { ensureArray } from "../shared/ensureArray";

type UseWorkspaceDerivedParams = {
  projects: Project[];
  currentProjectId: number | null;
  iterations: Iteration[];
  currentIterationId: number | null;
};

const PROGRESS_BUCKETS = [
  { label: "0-25%", min: 0, max: 25 },
  { label: "26-50%", min: 26, max: 50 },
  { label: "51-75%", min: 51, max: 75 },
  { label: "76-100%", min: 76, max: 100 }
] as const;

function computeProgressBuckets(items: Iteration[]) {
  return PROGRESS_BUCKETS.map((b) => ({
    label: b.label,
    count: items.filter((i) => i.progress >= b.min && i.progress <= b.max).length
  }));
}

function computeMonthlyTrend(items: Iteration[]) {
  const counter = new Map<string, number>();
  for (const item of items) {
    const month = item.createdAt?.slice(0, 7);
    if (!month) continue;
    counter.set(month, (counter.get(month) || 0) + 1);
  }
  const points = Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, count]) => ({ label: month, count }));
  return points.length > 0 ? points : [{ label: "暂无", count: 0 }];
}

export function useWorkspaceDerived({
  projects,
  currentProjectId,
  iterations,
  currentIterationId
}: UseWorkspaceDerivedParams) {
  const currentProject = useMemo(
    () => ensureArray<Project>(projects).find((item) => item.id === currentProjectId) ?? null,
    [projects, currentProjectId]
  );
  const currentIteration = useMemo(
    () => ensureArray<Iteration>(iterations).find((item) => item.id === currentIterationId) ?? null,
    [iterations, currentIterationId]
  );
  const safeIterations = useMemo(() => ensureArray<Iteration>(iterations), [iterations]);
  const completedIterations = useMemo(
    () => safeIterations.filter((item) => item.status === "completed").length,
    [safeIterations]
  );
  const inProgressIterations = useMemo(
    () => safeIterations.filter((item) => item.status !== "completed").length,
    [safeIterations]
  );
  const projectProgress = useMemo(() => {
    if (safeIterations.length === 0) return 0;
    return Math.round(safeIterations.reduce((sum, item) => sum + item.progress, 0) / safeIterations.length);
  }, [safeIterations]);
  const progressBuckets = useMemo(() => computeProgressBuckets(safeIterations), [safeIterations]);
  const monthlyTrend = useMemo(() => computeMonthlyTrend(safeIterations), [safeIterations]);

  return {
    currentProject,
    currentIteration,
    completedIterations,
    inProgressIterations,
    projectProgress,
    progressBuckets,
    monthlyTrend
  };
}
