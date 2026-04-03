import type { PolicyExecutionLogPayload, ProjectPolicyPayload, ProjectRoleBindingPayload } from "../../app/workspaceApi";
import type { AssistantDialogMode } from "../layout/assistantPromptComposer";

export type RepoHealthView = {
  remoteConfigured: boolean;
  remoteReachable: boolean;
  remoteSynced: boolean;
  lastCheckedAt: string;
  lastError: string;
};

export type RepoMigrationPlanView = {
  currentMode: "external_git" | "managed_local" | "hybrid";
  targetMode: "hybrid" | "external_git";
  blockers: string[];
  nextAction: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    status: "pending" | "ready" | "done" | "blocked";
    action: string;
  }>;
};

export type ProjectOverviewGovernanceDrawersProps = {
  showPolicyDrawer: boolean;
  setShowPolicyDrawer: (value: boolean) => void;
  showAssistantDrawer: boolean;
  setShowAssistantDrawer: (value: boolean) => void;
  activePolicy: ProjectPolicyPayload | null;
  policyItems: ProjectPolicyPayload[];
  isAdmin: boolean;
  policyBusy: boolean;
  handleCreatePolicyDraft: () => Promise<void>;
  handleActivateLatestDraft: () => Promise<void>;
  handleRestoreInitialPolicyMode: () => Promise<void>;
  handleRunPolicyStep: () => Promise<void>;
  bindingProfile: string;
  setBindingProfile: (value: string) => void;
  bindingAgentId: string;
  setBindingAgentId: (value: string) => void;
  bindingWorkspacePath: string;
  setBindingWorkspacePath: (value: string) => void;
  bindingRuntimeMode: "native" | "bridge";
  setBindingRuntimeMode: (value: "native" | "bridge") => void;
  handleBindWorkspace: () => Promise<void>;
  newRoleUserId: string;
  setNewRoleUserId: (value: string) => void;
  newRoleValue: "admin" | "member" | "viewer";
  setNewRoleValue: (value: "admin" | "member" | "viewer") => void;
  handleAddRoleBinding: () => Promise<void>;
  roleBindings: ProjectRoleBindingPayload[];
  handleRemoveRoleBinding: (userId: string) => Promise<void>;
  targetIterationId: number | null;
  assistantChatLines: Array<{ role: "admin" | "assistant"; content: string; at: string }>;
  assistantDialogMode: AssistantDialogMode;
  setAssistantDialogMode: (value: AssistantDialogMode) => void;
  assistantChatInput: string;
  setAssistantChatInput: (value: string) => void;
  assistantChatBusy: boolean;
  handleAssistantSend: () => Promise<void>;
  policyLogs: PolicyExecutionLogPayload[];
};

export type ProjectOverviewRepositoryDrawerProps = {
  showRepoConfigDrawer: boolean;
  setShowRepoConfigDrawer: (value: boolean) => void;
  repoConfigStep: 1 | 2 | 3;
  setRepoConfigStep: (value: 1 | 2 | 3 | ((prev: 1 | 2 | 3) => 1 | 2 | 3)) => void;
  repoUrlDraft: string;
  setRepoUrlDraft: (value: string) => void;
  currentProjectExists: boolean;
  repoConfigBusy: boolean;
  repoValidationBusy: boolean;
  repoUrlValid: boolean;
  repoValidationError: string;
  requireRemoteForProduction: boolean;
  setRequireRemoteForProduction: (value: boolean) => void;
  requireRemoteForStaging: boolean;
  setRequireRemoteForStaging: (value: boolean) => void;
  repoHealth: RepoHealthView | null;
  repoLastCheckedText: string;
  repoConfigNotice: string;
  showRepoAdvanced: boolean;
  setShowRepoAdvanced: (updater: (prev: boolean) => boolean) => void;
  repoMigrationPlan: RepoMigrationPlanView | null;
  canMoveToNextStep: boolean;
  handleAdvanceRepositoryStep: () => Promise<void>;
  handleSaveRepositoryPolicy: () => Promise<void>;
  handleRefreshRepositoryStatus: () => Promise<void>;
  handleConnectRepository: () => Promise<void>;
};
