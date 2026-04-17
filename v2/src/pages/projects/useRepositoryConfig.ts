import type React from "react";
import { useEffect, useState } from "react";
import type { Project } from "../../domain/workspace/types";
import {
  bootstrapProjectRepository,
  configureProjectRepositoryMode,
  fetchProjectRepositoryMigrationPlan,
  fetchProjectRepositoryStatus,
  validateProjectRepositoryRemote
} from "../../app/workspaceApi";
import {
  guessRepoName,
  inferProviderFromRepoUrl,
  looksLikeGitUrl
} from "./projectOverviewPanelHelpers";

export type RepoHealthState = {
  remoteConfigured: boolean;
  remoteReachable: boolean;
  remoteSynced: boolean;
  lastCheckedAt: string;
  lastError: string;
} | null;

export type RepoMigrationPlanState = {
  currentMode: "external_git" | "managed_local" | "hybrid" | "none";
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
} | null;

type RepoConfigState = {
  showRepoConfigDrawer: boolean; setShowRepoConfigDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  repoConfigStep: 1 | 2 | 3; setRepoConfigStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  repoUrlDraft: string; setRepoUrlDraft: React.Dispatch<React.SetStateAction<string>>;
  showRepoAdvanced: boolean; setShowRepoAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  requireRemoteForProduction: boolean; setRequireRemoteForProduction: React.Dispatch<React.SetStateAction<boolean>>;
  requireRemoteForStaging: boolean; setRequireRemoteForStaging: React.Dispatch<React.SetStateAction<boolean>>;
  repoHealth: RepoHealthState; setRepoHealth: React.Dispatch<React.SetStateAction<RepoHealthState>>;
  repoConfigBusy: boolean; setRepoConfigBusy: React.Dispatch<React.SetStateAction<boolean>>;
  repoValidationBusy: boolean; setRepoValidationBusy: React.Dispatch<React.SetStateAction<boolean>>;
  repoValidationError: string; setRepoValidationError: React.Dispatch<React.SetStateAction<string>>;
  repoConfigNotice: string; setRepoConfigNotice: React.Dispatch<React.SetStateAction<string>>;
  repoMigrationPlan: RepoMigrationPlanState; setRepoMigrationPlan: React.Dispatch<React.SetStateAction<RepoMigrationPlanState>>;
};

function useRepoConfigState(currentProject: Project | null): RepoConfigState {
  const [showRepoConfigDrawer, setShowRepoConfigDrawer] = useState(false);
  const [repoConfigStep, setRepoConfigStep] = useState<1 | 2 | 3>(1);
  const [repoUrlDraft, setRepoUrlDraft] = useState(currentProject?.repository?.url || "");
  const [showRepoAdvanced, setShowRepoAdvanced] = useState(false);
  const [requireRemoteForProduction, setRequireRemoteForProduction] = useState(
    currentProject?.repository?.governance?.requireRemoteForProduction ?? true
  );
  const [requireRemoteForStaging, setRequireRemoteForStaging] = useState(
    currentProject?.repository?.governance?.requireRemoteForStaging ?? false
  );
  const [repoHealth, setRepoHealth] = useState<RepoHealthState>(null);
  const [repoConfigBusy, setRepoConfigBusy] = useState(false);
  const [repoValidationBusy, setRepoValidationBusy] = useState(false);
  const [repoValidationError, setRepoValidationError] = useState("");
  const [repoConfigNotice, setRepoConfigNotice] = useState("");
  const [repoMigrationPlan, setRepoMigrationPlan] = useState<RepoMigrationPlanState>(null);
  return {
    showRepoConfigDrawer, setShowRepoConfigDrawer, repoConfigStep, setRepoConfigStep,
    repoUrlDraft, setRepoUrlDraft, showRepoAdvanced, setShowRepoAdvanced,
    requireRemoteForProduction, setRequireRemoteForProduction, requireRemoteForStaging, setRequireRemoteForStaging,
    repoHealth, setRepoHealth, repoConfigBusy, setRepoConfigBusy,
    repoValidationBusy, setRepoValidationBusy, repoValidationError, setRepoValidationError,
    repoConfigNotice, setRepoConfigNotice, repoMigrationPlan, setRepoMigrationPlan,
  };
}

function useRepoConfigEffects(currentProject: Project | null, state: RepoConfigState) {
  useEffect(() => {
    state.setRepoUrlDraft(currentProject?.repository?.url || "");
    state.setRequireRemoteForProduction(currentProject?.repository?.governance?.requireRemoteForProduction ?? true);
    state.setRequireRemoteForStaging(currentProject?.repository?.governance?.requireRemoteForStaging ?? false);
    state.setRepoHealth(currentProject?.repository?.health || null);
    state.setRepoMigrationPlan(null);
    state.setRepoValidationError("");
    state.setRepoConfigNotice("");
  }, [currentProject?.id, currentProject?.repository?.url, currentProject?.repository?.governance?.requireRemoteForProduction, currentProject?.repository?.governance?.requireRemoteForStaging]);

  useEffect(() => {
    if (!state.showRepoConfigDrawer) return;
    state.setRepoConfigStep(1);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") state.setShowRepoConfigDrawer(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.showRepoConfigDrawer]);

  useEffect(() => {
    state.setRepoValidationError("");
    state.setRepoConfigNotice("");
  }, [state.repoUrlDraft]);
}

async function refreshRepositoryStatus(projectId: number, state: RepoConfigState) {
  try {
    state.setRepoConfigBusy(true);
    state.setRepoValidationError("");
    const status = await fetchProjectRepositoryStatus(projectId);
    state.setRepoHealth(status?.health || null);
    state.setRequireRemoteForProduction(status?.governance?.requireRemoteForProduction ?? true);
    state.setRequireRemoteForStaging(status?.governance?.requireRemoteForStaging ?? false);
    const migrationPlan = await fetchProjectRepositoryMigrationPlan(projectId);
    state.setRepoMigrationPlan(migrationPlan);
    state.setRepoConfigNotice("代码仓连接状态已刷新。");
  } catch (error) {
    state.setRepoConfigNotice(error instanceof Error ? error.message : "代码仓状态刷新失败");
  } finally {
    state.setRepoConfigBusy(false);
  }
}

async function runRemoteValidation(projectId: number, repoUrlDraft: string, state: RepoConfigState): Promise<boolean> {
  const url = repoUrlDraft.trim();
  if (!url) { state.setRepoValidationError("请先填写 Git 仓库地址。"); return false; }
  if (!looksLikeGitUrl(url)) { state.setRepoValidationError("地址格式不正确，请使用 https://、ssh:// 或 git@ 开头。"); return false; }
  try {
    state.setRepoValidationBusy(true);
    state.setRepoValidationError("");
    await validateProjectRepositoryRemote(projectId, { url });
    return true;
  } catch (error) {
    state.setRepoValidationError(error instanceof Error ? error.message.replace(/^API error:\s*/i, "") : "仓库地址校验失败");
    return false;
  } finally {
    state.setRepoValidationBusy(false);
  }
}

async function connectRepository(projectId: number, state: RepoConfigState) {
  const url = state.repoUrlDraft.trim();
  if (!url) {
    state.setRepoConfigStep(1);
    state.setRepoValidationError("请先填写 Git 仓库地址。");
    state.setRepoConfigNotice("请先填写 Git 仓库地址。");
    return;
  }
  const repoName = guessRepoName(url) || "project";
  try {
    state.setRepoConfigBusy(true);
    state.setRepoValidationError("");
    const passed = await runRemoteValidation(projectId, state.repoUrlDraft, state);
    if (!passed) { state.setRepoConfigStep(1); state.setRepoConfigNotice("仓库地址校验未通过，请修正后再保存。"); return; }
    await bootstrapProjectRepository(projectId, {
      provider: inferProviderFromRepoUrl(url), name: repoName, url, defaultBranch: "main",
      repoMode: "external_git", requireRemoteForProduction: state.requireRemoteForProduction, requireRemoteForStaging: state.requireRemoteForStaging,
    });
    await refreshRepositoryStatus(projectId, state);
    state.setRepoConfigNotice("代码仓地址已保存并完成连接。");
  } catch (error) {
    state.setRepoConfigNotice(error instanceof Error ? error.message : "代码仓连接失败");
  } finally {
    state.setRepoConfigBusy(false);
  }
}

function buildRepoHandlers(currentProject: Project | null, state: RepoConfigState) {
  const handleRefreshRepositoryStatus = async () => {
    if (!currentProject) return;
    await refreshRepositoryStatus(currentProject.id, state);
  };

  const handleAdvanceRepositoryStep = async () => {
    if (state.repoConfigStep !== 1) {
      state.setRepoConfigStep(state.repoConfigStep < 3 ? ((state.repoConfigStep + 1) as 1 | 2 | 3) : state.repoConfigStep);
      return;
    }
    if (!currentProject) return;
    const passed = await runRemoteValidation(currentProject.id, state.repoUrlDraft, state);
    if (!passed) return;
    state.setRepoConfigNotice("仓库地址校验通过，可以继续配置发布规则。");
    state.setRepoConfigStep(2);
  };

  const handleConnectRepository = async () => {
    if (!currentProject) return;
    await connectRepository(currentProject.id, state);
  };

  const handleSaveRepositoryPolicy = async () => {
    if (!currentProject) return;
    try {
      state.setRepoConfigBusy(true);
      await configureProjectRepositoryMode(currentProject.id, {
        repoMode: state.repoUrlDraft.trim() ? "external_git" : "hybrid",
        requireRemoteForProduction: state.requireRemoteForProduction, requireRemoteForStaging: state.requireRemoteForStaging,
      });
      await refreshRepositoryStatus(currentProject.id, state);
      state.setRepoConfigNotice("发布前规则已更新。");
    } catch (error) {
      state.setRepoConfigNotice(error instanceof Error ? error.message : "发布前规则更新失败");
    } finally {
      state.setRepoConfigBusy(false);
    }
  };

  return { handleRefreshRepositoryStatus, handleAdvanceRepositoryStep, handleConnectRepository, handleSaveRepositoryPolicy };
}

export function useRepositoryConfig(currentProject: Project | null) {
  const state = useRepoConfigState(currentProject);
  useRepoConfigEffects(currentProject, state);
  const handlers = buildRepoHandlers(currentProject, state);

  return {
    ...state,
    repoUrlValid: looksLikeGitUrl(state.repoUrlDraft),
    repoLastCheckedText: state.repoHealth?.lastCheckedAt ? new Date(state.repoHealth.lastCheckedAt).toLocaleString("zh-CN") : "",
    canMoveToNextStep: state.repoConfigStep === 1 ? looksLikeGitUrl(state.repoUrlDraft) : true,
    ...handlers,
  };
}
