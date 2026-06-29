export type StatusPayload = {
  status: string;
  service: string;
};

/**
 * 目标端类型 — 项目交付物所面向的运行端。固定枚举保类型安全，端集合有限稳定。
 * 与多租户角色无关，这是「交付目标端」轴。前端多选 UI 用 TARGET_PLATFORMS 渲染选项；
 * 去重/过滤非法由后端 normalizeTargetPlatforms 兜底，UI 只管传数组。
 */
export type TargetPlatform =
  | "web"
  | "ios"
  | "android"
  | "harmony"
  | "linux"
  | "windows"
  | "macos"
  | "server"
  | "other";

/** 合法的目标端取值集合（UI 多选选项来源，与后端 TARGET_PLATFORMS 对齐）。 */
export const TARGET_PLATFORMS: readonly TargetPlatform[] = [
  "web", "ios", "android", "harmony", "linux", "windows", "macos", "server", "other"
];

export type RepositoryLayoutNode = {
  path: string;
  purpose: string;
  required: boolean;
};

export type ProjectRepository = {
  id: string;
  repoMode: "external_git" | "managed_local" | "hybrid" | "none";
  provider: "github" | "gitlab" | "gitea" | "bitbucket" | "custom" | "";
  organization: string;
  name: string;
  url: string;
  defaultBranch: string;
  structureVersion: string;
  layout: RepositoryLayoutNode[];
  remote?: {
    status: "unprovisioned" | "provisioned" | "dry-run";
    visibility: "private" | "public";
    ownerType: "org" | "user";
    providerRepoId: string;
    htmlUrl: string;
    cloneUrl: string;
    sshUrl: string;
    lastProvisionedAt: string;
  };
  workspace?: {
    rootPath: string;
    repoPath: string;
    gitInitialized: boolean;
    lastScaffoldedAt: string;
  };
  governance?: {
    requireRemoteForProduction: boolean;
    requireRemoteForStaging: boolean;
  };
  health?: {
    remoteConfigured: boolean;
    remoteReachable: boolean;
    remoteSynced: boolean;
    lastCheckedAt: string;
    lastError: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProjectKnowledgeBase = {
  ontologyTerms: Array<{ term: string; aliases: string[]; definition: string; evidence: string }>;
  stableRules: Array<{ rule: string; rationale: string; source: string }>;
  componentInventory: Array<{ component: string; responsibility: string; relatedRequirements: string[]; relatedCodePaths: string[] }>;
  codeMap: Array<{ capability: string; codePaths: string[]; tests: string[] }>;
  decisionLog: Array<{ decision: string; status: "active" | "deprecated"; rationale: string; iterationVersion: string }>;
  knownRisks: Array<{ risk: string; mitigation: string; trigger: string }>;
  changePatterns: Array<{ pattern: string; preferredFlow: string; avoid: string }>;
  updatedAt: string;
};

export type Project = {
  id: number;
  tenantId?: string;
  ownerUserId?: string;
  name: string;
  description: string;
  status: string;
  deletedAt?: string;
  icon?: string;
  iconColor?: string;
  lastUpdated?: string;
  currentUserRole?: "owner" | "pm" | "developer" | "qa" | "viewer";
  /** 项目交付物面向的目标端集合，默认 ["web"] 向后兼容（未声明时视为纯 web 项目）。 */
  targetPlatforms?: TargetPlatform[];
  repository?: ProjectRepository;
  knowledgeBase?: ProjectKnowledgeBase;
};
