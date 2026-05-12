import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type { IterationAgentPrompt } from '../../../domain/workspace/analysisTypes';
import type { ExperienceSearchResult, CrossProjectInsight, CrossProjectInsightsReport } from '../../../domain/workspace/experienceSearchTypes';
import type { KnowledgeEntry } from '../../../domain/workspace/knowledgeTypes';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("cross-project");

export function searchExperienceAcrossProjects(
  repo: WorkspaceRepository,
  query: string,
  tenantId: string,
  limit = 20
): ExperienceSearchResult[] {
  const entries = repo.searchKnowledgeAcrossProjects(tenantId, query, limit);
  const projects = repo.listProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return entries.map((entry) => ({
    entry,
    projectId: entry.projectId,
    projectName: projectMap.get(entry.projectId) || `项目${entry.projectId}`,
    relevanceScore: computeRelevance(entry, query),
    matchReason: buildMatchReason(entry, query)
  }));
}

function computeRelevance(entry: KnowledgeEntry, query: string): number {
  let score = 0;
  const q = query.toLowerCase();
  if (entry.title.toLowerCase().includes(q)) score += 40;
  if (entry.content.toLowerCase().includes(q)) score += 30;
  if (entry.applicableScene.toLowerCase().includes(q)) score += 20;
  if (entry.tags.some((t) => t.toLowerCase().includes(q))) score += 10;
  if (entry.experienceScope === "cross-project") score += 10;
  if (entry.confidence && entry.confidence >= 80) score += 5;
  return Math.min(100, score);
}

function buildMatchReason(entry: KnowledgeEntry, query: string): string {
  const q = query.toLowerCase();
  const reasons: string[] = [];
  if (entry.title.toLowerCase().includes(q)) reasons.push("标题匹配");
  if (entry.content.toLowerCase().includes(q)) reasons.push("内容匹配");
  if (entry.applicableScene.toLowerCase().includes(q)) reasons.push("适用场景匹配");
  if (entry.tags.some((t) => t.toLowerCase().includes(q))) reasons.push("标签匹配");
  return reasons.join("、") || "相关性匹配";
}

export async function generateCrossProjectInsights(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  tenantId: string
): Promise<CrossProjectInsightsReport> {
  const projects = repo.listProjects().filter((p) => !p.deletedAt && (p.tenantId === tenantId || !p.tenantId));
  if (projects.length === 0) {
    return { insights: [], generatedAt: new Date().toISOString(), projectCount: 0, totalExperienceEntries: 0 };
  }

  const projectSummaries: string[] = [];
  let totalEntries = 0;

  for (const project of projects) {
    const entries = repo.listKnowledgeEntries(project.id);
    const iterations = repo.listIterations(project.id);
    const completedCount = iterations.filter((i) => i.status === "completed").length;
    totalEntries += entries.length;

    const categoryCounts = new Map<string, number>();
    for (const e of entries) {
      categoryCounts.set(e.category, (categoryCounts.get(e.category) || 0) + 1);
    }
    const categoryStr = Array.from(categoryCounts.entries())
      .map(([cat, count]) => `${cat}:${count}`)
      .join(", ");

    projectSummaries.push(
      `项目「${project.name}」：${iterations.length}个迭代（${completedCount}已完成），` +
      `知识条目${entries.length}条（${categoryStr || "无"}）`
    );
  }

  if (!agentRunner) {
    return buildFallbackInsights(projects, totalEntries);
  }

  const prompt: IterationAgentPrompt = {
    agentId: "cross-project-insights",
    role: "solution-architect",
    scope: "iteration",
    goal: "生成跨项目全景洞察",
    systemPrompt: `你是一位组织级项目治理专家。基于多个项目的知识沉淀数据，生成全景洞察。

分析维度：
1. completion-rate：各项目迭代完成率对比
2. quality-trend：经验沉淀质量趋势
3. risk-pattern：跨项目共性风险模式
4. knowledge-coverage：知识覆盖度差异

输出必须是严格 JSON 数组：
[{
  "dimension": "risk-pattern",
  "title": "洞察标题",
  "finding": "发现描述",
  "recommendation": "建议",
  "affectedProjects": ["项目名1"]
}]

最多输出 6 条洞察，聚焦可操作的治理建议。只输出 JSON 数组。`,
    userPrompt: `以下是组织内所有项目的概况：\n\n${projectSummaries.join("\n")}`,
    expectedOutput: "json"
  };

  try {
    const result = await agentRunner.run(prompt);
    const insights = parseInsightsResult(result.content);
    return {
      insights,
      generatedAt: new Date().toISOString(),
      projectCount: projects.length,
      totalExperienceEntries: totalEntries
    };
  } catch (err) {
    log.error(`跨项目洞察生成失败: ${err instanceof Error ? err.message : String(err)}`);
    return buildFallbackInsights(projects, totalEntries);
  }
}

function parseInsightsResult(content: string): CrossProjectInsight[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const validDimensions = new Set(["completion-rate", "quality-trend", "risk-pattern", "knowledge-coverage"]);
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        dimension: validDimensions.has(String(item.dimension))
          ? String(item.dimension) as CrossProjectInsight["dimension"]
          : "knowledge-coverage",
        title: String(item.title || ""),
        finding: String(item.finding || ""),
        recommendation: String(item.recommendation || ""),
        affectedProjects: Array.isArray(item.affectedProjects) ? item.affectedProjects.map(String) : []
      }))
      .filter((item) => item.title && item.finding)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function buildFallbackInsights(
  projects: { name: string; id: number }[],
  totalEntries: number
): CrossProjectInsightsReport {
  const insights: CrossProjectInsight[] = [];
  if (totalEntries === 0) {
    insights.push({
      dimension: "knowledge-coverage",
      title: "知识沉淀尚未启动",
      finding: `${projects.length} 个项目均无知识条目沉淀`,
      recommendation: "建议在迭代过程中启用自动经验提取，或手动录入关键经验",
      affectedProjects: projects.map((p) => p.name)
    });
  }
  return {
    insights,
    generatedAt: new Date().toISOString(),
    projectCount: projects.length,
    totalExperienceEntries: totalEntries
  };
}
