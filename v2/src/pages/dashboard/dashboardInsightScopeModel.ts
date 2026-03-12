export type InsightScope = "project" | "portfolio";
export type InsightWindowDays = 30 | 90;
export type InsightLevel = "good" | "watch" | "risk";

export function getScopeIterations<T>(
  insightScope: InsightScope,
  iterationsByProject: Record<number, T[]>,
  selectedProjectId: number | null
) {
  if (insightScope === "portfolio") {
    return Object.values(iterationsByProject).flat();
  }
  return selectedProjectId ? (iterationsByProject[selectedProjectId] ?? []) : [];
}

export function filterIterationsByWindow<T extends { createdAt?: string | null }>(
  iterations: T[],
  insightWindowDays: InsightWindowDays,
  now = new Date()
) {
  const cutoff = now.getTime() - insightWindowDays * 24 * 60 * 60 * 1000;
  return iterations.filter((item) => {
    if (!item.createdAt) {
      return true;
    }
    const timestamp = new Date(item.createdAt).getTime();
    return Number.isFinite(timestamp) ? timestamp >= cutoff : true;
  });
}

export function sortInsightsByLevel<T extends { level: InsightLevel }>(items: T[]) {
  const rank: Record<InsightLevel, number> = { risk: 0, watch: 1, good: 2 };
  return [...items].sort((left, right) => rank[left.level] - rank[right.level]);
}
