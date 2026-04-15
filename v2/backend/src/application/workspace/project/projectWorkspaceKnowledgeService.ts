import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { buildShards, buildProjectSummaryDoc, buildBusinessOntologyDoc, buildTechnicalOntologyDoc, buildDecisionRiskDoc, buildReleaseHistoryDoc, buildDailySummaryDoc } from "./projectWorkspaceKnowledgeText";
import { buildVector, cosineSimilarity, INDEX_VERSION, type IndexedProjectKnowledgeShard, VECTOR_DIMENSIONS } from "./projectWorkspaceKnowledgeIndex";
import type { ProjectKnowledgeSearchResult, ProjectWorkspaceSyncResult } from "./projectWorkspaceKnowledgeTypes";

export type { ProjectKnowledgeSearchResult, ProjectKnowledgeShard, ProjectWorkspaceSyncResult } from "./projectWorkspaceKnowledgeTypes";

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeTextFile(path: string, content: string) {
  ensureDir(dirname(path));
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
}

function safeJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function isoDay(value: string) {
  return value.slice(0, 10);
}

function resolveKnowledgeRoot(workspacePath: string) {
  return join(resolve(workspacePath), ".buildwise");
}

function writeKnowledgeMemoryFiles(
  documents: Record<string, string>,
  project: NonNullable<ReturnType<WorkspaceRepository["findProject"]>>,
  kb: NonNullable<ReturnType<typeof import("../shared/workspaceSupport").normalizeProject>["knowledgeBase"]>,
  iterations: ReturnType<WorkspaceRepository["listIterations"]>,
  now: string
) {
  writeTextFile(
    documents.workspace,
    JSON.stringify({ version: INDEX_VERSION, projectId: project.id, projectName: project.name, status: project.status, syncedAt: now }, null, 2)
  );
  writeTextFile(documents.projectSummary, buildProjectSummaryDoc(project, iterations));
  writeTextFile(documents.business, buildBusinessOntologyDoc(kb));
  writeTextFile(documents.technical, buildTechnicalOntologyDoc(kb));
  writeTextFile(documents.decisions, buildDecisionRiskDoc(kb));
  writeTextFile(documents.releaseHistory, buildReleaseHistoryDoc(iterations));
  writeTextFile(
    documents.memoryIndex,
    [
      `# ${project.name} Memory Index`, "",
      "- `project-summary.md`：项目基础信息与最近迭代",
      "- `ontology-business.md`：业务术语与稳定规则",
      "- `ontology-tech.md`：技术本体、组件与代码映射",
      "- `decisions.md`：决策、风险与变更模式",
      "- `release-history.md`：迭代发布历史",
      "- `daily/*.md`：每日自动汇总",
    ].join("\n")
  );
  writeTextFile(documents.daily, buildDailySummaryDoc(project, iterations, now));
}

export function syncProjectWorkspaceKnowledge(repo: WorkspaceRepository, projectId: number): ProjectWorkspaceSyncResult | null {
  const project = repo.findProject(projectId);
  const binding = repo.listProjectWorkspaceBindings(projectId)[0] || null;
  if (!project || !binding || !binding.workspacePath.trim()) {
    return null;
  }

  const iterations = repo.listIterations(projectId);
  const now = new Date().toISOString();
  const kb = project.knowledgeBase ?? {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: ""
  };

  const workspacePath = resolve(binding.workspacePath.trim());
  const knowledgeRoot = resolveKnowledgeRoot(binding.workspacePath.trim());
  const memoryDir = join(knowledgeRoot, "memory");
  const dailyDir = join(memoryDir, "daily");
  const shardDir = join(knowledgeRoot, "shards");
  const indexDir = join(knowledgeRoot, "index");

  ensureDir(memoryDir);
  ensureDir(dailyDir);
  ensureDir(shardDir);
  ensureDir(indexDir);

  const documents = {
    workspace: join(knowledgeRoot, "workspace.json"),
    projectSummary: join(memoryDir, "project-summary.md"),
    business: join(memoryDir, "ontology-business.md"),
    technical: join(memoryDir, "ontology-tech.md"),
    decisions: join(memoryDir, "decisions.md"),
    releaseHistory: join(memoryDir, "release-history.md"),
    memoryIndex: join(memoryDir, "MEMORY.md"),
    daily: join(dailyDir, `${isoDay(now)}.md`)
  };

  writeKnowledgeMemoryFiles(documents, project, kb, iterations, now);

  const shards = buildShards(project, kb, iterations, now);
  for (const shard of shards) {
    writeTextFile(join(shardDir, `${shard.id}.md`), shard.content);
  }

  const indexedShards: IndexedProjectKnowledgeShard[] = shards.map((item) => ({
    ...item,
    vector: buildVector(`${item.title}\n${item.content}\n${item.tags.join(" ")}`)
  }));
  writeTextFile(
    join(indexDir, "shards.json"),
    JSON.stringify(
      {
        version: INDEX_VERSION,
        projectId,
        updatedAt: now,
        dimensions: VECTOR_DIMENSIONS,
        shards: indexedShards
      },
      null,
      2
    )
  );

  return {
    projectId,
    workspacePath,
    documentsWritten: Object.values(documents),
    shardCount: indexedShards.length,
    syncedAt: now
  };
}

export function syncAllProjectWorkspaceKnowledge(repo: WorkspaceRepository) {
  return repo
    .listProjects()
    .map((item) => syncProjectWorkspaceKnowledge(repo, item.id))
    .filter((item): item is ProjectWorkspaceSyncResult => Boolean(item));
}

export function searchProjectWorkspaceKnowledge(repo: WorkspaceRepository, projectId: number, query: string, limit = 4): ProjectKnowledgeSearchResult[] {
  const binding = repo.listProjectWorkspaceBindings(projectId)[0] || null;
  if (!binding || !binding.workspacePath.trim()) {
    return [];
  }
  const indexPath = join(resolveKnowledgeRoot(binding.workspacePath.trim()), "index", "shards.json");
  const parsed = safeJson<{ shards?: IndexedProjectKnowledgeShard[] }>(indexPath);
  const shards = Array.isArray(parsed?.shards) ? parsed?.shards : [];
  if (shards.length === 0) {
    return [];
  }

  const queryVector = buildVector(query);
  return shards
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      content: item.content,
      score: Number(cosineSimilarity(queryVector, item.vector).toFixed(4)),
      tags: item.tags
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
