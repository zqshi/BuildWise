import type { Project, ProjectRepository } from '../../../domain/workspace/types';
import { toRepoSlug } from '../../../domain/workspace/repositoryNaming';

function defaultRepositoryLayout(): ProjectRepository["layout"] {
  return [
    { path: "apps/web", purpose: "前端应用", required: true },
    { path: "apps/api", purpose: "后端服务", required: true },
    { path: "packages/domain", purpose: "领域模型与用例", required: true },
    { path: "packages/shared", purpose: "跨端共享模块", required: false },
    { path: "docs", purpose: "PRD/ADR/迭代记录", required: true },
    { path: "tests", purpose: "集成与契约测试", required: true },
    { path: "infra", purpose: "部署与环境脚本", required: true },
    { path: ".github/workflows", purpose: "CI/CD 流水线", required: true }
  ];
}
function createDefaultProjectRepository(project: Pick<Project, "id" | "name">): ProjectRepository {
  const now = new Date().toISOString();
  const repoName = toRepoSlug(project.name, `project-${project.id}`);
  return {
    id: `repo-${project.id}`,
    repoMode: "hybrid",
    provider: "github",
    organization: "",
    name: repoName,
    url: "",
    defaultBranch: "main",
    structureVersion: "v1",
    layout: defaultRepositoryLayout(),
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
  };
}
export function normalizeProject(project: Project): Project {
  const repo = project.repository ?? createDefaultProjectRepository(project);
  return {
    ...project,
    tenantId: typeof project.tenantId === "string" ? project.tenantId.trim() : typeof project.ownerUserId === "string" ? project.ownerUserId.trim() : "",
    ownerUserId: typeof project.ownerUserId === "string" ? project.ownerUserId.trim() : typeof project.tenantId === "string" ? project.tenantId.trim() : "",
    knowledgeBase: {
      ontologyTerms: Array.isArray(project.knowledgeBase?.ontologyTerms) ? project.knowledgeBase?.ontologyTerms : [],
      stableRules: Array.isArray(project.knowledgeBase?.stableRules) ? project.knowledgeBase?.stableRules : [],
      componentInventory: Array.isArray(project.knowledgeBase?.componentInventory) ? project.knowledgeBase?.componentInventory : [],
      codeMap: Array.isArray(project.knowledgeBase?.codeMap) ? project.knowledgeBase?.codeMap : [],
      decisionLog: Array.isArray(project.knowledgeBase?.decisionLog) ? project.knowledgeBase?.decisionLog : [],
      knownRisks: Array.isArray(project.knowledgeBase?.knownRisks) ? project.knowledgeBase?.knownRisks : [],
      changePatterns: Array.isArray(project.knowledgeBase?.changePatterns) ? project.knowledgeBase?.changePatterns : [],
      updatedAt: typeof project.knowledgeBase?.updatedAt === "string" ? project.knowledgeBase.updatedAt : ""
    },
    repository: {
      ...repo,
      repoMode:
        repo.repoMode === "external_git" || repo.repoMode === "managed_local" || repo.repoMode === "hybrid" || repo.repoMode === "none" ? repo.repoMode : "none",
      remote: repo.remote ?? {
        status: "unprovisioned",
        visibility: "private",
        ownerType: "org",
        providerRepoId: "",
        htmlUrl: "",
        cloneUrl: "",
        sshUrl: "",
        lastProvisionedAt: ""
      },
      workspace: repo.workspace ?? {
        rootPath: "",
        repoPath: "",
        gitInitialized: false,
        lastScaffoldedAt: ""
      },
      governance: repo.governance ?? {
        requireRemoteForProduction: true,
        requireRemoteForStaging: false
      },
      health: repo.health ?? {
        remoteConfigured: false,
        remoteReachable: false,
        remoteSynced: false,
        lastCheckedAt: "",
        lastError: ""
      }
    }
  };
}
