import { useMemo } from "react";
import type { Iteration, Project } from "../domain/workspace/types";
import { ensureArray } from "../shared/ensureArray";

type UseWorkspaceDerivedParams = {
  projects: Project[];
  currentProjectId: number | null;
  iterations: Iteration[];
  currentIterationId: number | null;
};

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
  const completedIterations = useMemo(
    () => ensureArray<Iteration>(iterations).filter((item) => item.status === "completed").length,
    [iterations]
  );
  const inProgressIterations = useMemo(
    () => ensureArray<Iteration>(iterations).filter((item) => item.status !== "completed").length,
    [iterations]
  );
  const projectProgress = useMemo(() => {
    const safeIterations = ensureArray<Iteration>(iterations);
    if (safeIterations.length === 0) {
      return 0;
    }
    return Math.round(safeIterations.reduce((sum, item) => sum + item.progress, 0) / safeIterations.length);
  }, [iterations]);
  const progressBuckets = useMemo(() => {
    const safeIterations = ensureArray<Iteration>(iterations);
    const buckets = [
      { label: "0-25%", min: 0, max: 25 },
      { label: "26-50%", min: 26, max: 50 },
      { label: "51-75%", min: 51, max: 75 },
      { label: "76-100%", min: 76, max: 100 }
    ];
    return buckets.map((bucket) => ({
      label: bucket.label,
      count: safeIterations.filter(
        (item) => item.progress >= bucket.min && item.progress <= bucket.max
      ).length
    }));
  }, [iterations]);
  const monthlyTrend = useMemo(() => {
    const safeIterations = ensureArray<Iteration>(iterations);
    const monthCounter = new Map<string, number>();
    for (const item of safeIterations) {
      const month = item.createdAt?.slice(0, 7);
      if (!month) {
        continue;
      }
      monthCounter.set(month, (monthCounter.get(month) || 0) + 1);
    }
    const points = Array.from(monthCounter.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, count]) => ({ label: month, count }));
    return points.length > 0 ? points : [{ label: "暂无", count: 0 }];
  }, [iterations]);

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
