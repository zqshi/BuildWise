export type StatusPayload = {
  status: string;
  service: string;
};

export type RepositoryLayoutNode = {
  path: string;
  purpose: string;
  required: boolean;
};

export type ProjectRepository = {
  id: string;
  provider: "github" | "gitlab" | "gitea" | "bitbucket" | "custom";
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
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: number;
  name: string;
  description: string;
  status: string;
  deletedAt?: string;
  lastUpdated?: string;
  repository?: ProjectRepository;
};
