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

export function useRepositoryConfig(currentProject: Project | null) {
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

  // Reset repo state when project changes
  useEffect(() => {
    setRepoUrlDraft(currentProject?.repository?.url || "");
    setRequireRemoteForProduction(currentProject?.repository?.governance?.requireRemoteForProduction ?? true);
    setRequireRemoteForStaging(currentProject?.repository?.governance?.requireRemoteForStaging ?? false);
    setRepoHealth(currentProject?.repository?.health || null);
    setRepoMigrationPlan(null);
    setRepoValidationError("");
    setRepoConfigNotice("");
  }, [currentProject?.id, currentProject?.repository?.url, currentProject?.repository?.governance?.requireRemoteForProduction, currentProject?.repository?.governance?.requireRemoteForStaging]);

  // Reset config step and handle ESC when drawer opens
  useEffect(() => {
    if (!showRepoConfigDrawer) return;
    setRepoConfigStep(1);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowRepoConfigDrawer(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRepoConfigDrawer]);

  // Clear validation on URL change
  useEffect(() => {
    setRepoValidationError("");
    setRepoConfigNotice("");
  }, [repoUrlDraft]);

  const handleRefreshRepositoryStatus = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      setRepoValidationError("");
      const status = await fetchProjectRepositoryStatus(currentProject.id);
      setRepoHealth(status?.health || null);
      setRequireRemoteForProduction(status?.governance?.requireRemoteForProduction ?? true);
      setRequireRemoteForStaging(status?.governance?.requireRemoteForStaging ?? false);
      const migrationPlan = await fetchProjectRepositoryMigrationPlan(currentProject.id);
      setRepoMigrationPlan(migrationPlan);
      setRepoConfigNotice("代码仓连接状态已刷新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓状态刷新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const runRepositoryRemoteValidation = async () => {
    if (!currentProject) {
      return false;
    }
    const url = repoUrlDraft.trim();
    if (!url) {
      setRepoValidationError("请先填写 Git 仓库地址。");
      return false;
    }
    if (!looksLikeGitUrl(url)) {
      setRepoValidationError("地址格式不正确，请使用 https://、ssh:// 或 git@ 开头。");
      return false;
    }
    try {
      setRepoValidationBusy(true);
      setRepoValidationError("");
      await validateProjectRepositoryRemote(currentProject.id, { url });
      return true;
    } catch (error) {
      setRepoValidationError(error instanceof Error ? error.message.replace(/^API error:\s*/i, "") : "仓库地址校验失败");
      return false;
    } finally {
      setRepoValidationBusy(false);
    }
  };

  const handleAdvanceRepositoryStep = async () => {
    if (repoConfigStep !== 1) {
      setRepoConfigStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
      return;
    }
    const passed = await runRepositoryRemoteValidation();
    if (!passed) {
      return;
    }
    setRepoConfigNotice("仓库地址校验通过，可以继续配置发布规则。");
    setRepoConfigStep(2);
  };

  const handleConnectRepository = async () => {
    if (!currentProject) return;
    const url = repoUrlDraft.trim();
    if (!url) {
      setRepoConfigStep(1);
      setRepoValidationError("请先填写 Git 仓库地址。");
      setRepoConfigNotice("请先填写 Git 仓库地址。");
      return;
    }
    const repoName = guessRepoName(url) || currentProject.name;
    try {
      setRepoConfigBusy(true);
      setRepoValidationError("");
      const passed = await runRepositoryRemoteValidation();
      if (!passed) {
        setRepoConfigStep(1);
        setRepoConfigNotice("仓库地址校验未通过，请修正后再保存。");
        return;
      }
      await bootstrapProjectRepository(currentProject.id, {
        provider: inferProviderFromRepoUrl(url),
        name: repoName,
        url,
        defaultBranch: "main",
        repoMode: "external_git",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("代码仓地址已保存并完成连接。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓连接失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const handleSaveRepositoryPolicy = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      await configureProjectRepositoryMode(currentProject.id, {
        repoMode: repoUrlDraft.trim() ? "external_git" : "hybrid",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("发布前规则已更新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "发布前规则更新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const repoUrlValid = looksLikeGitUrl(repoUrlDraft);
  const repoLastCheckedText = repoHealth?.lastCheckedAt ? new Date(repoHealth.lastCheckedAt).toLocaleString("zh-CN") : "";
  const canMoveToNextStep = repoConfigStep === 1 ? repoUrlValid : true;

  return {
    showRepoConfigDrawer,
    setShowRepoConfigDrawer,
    repoConfigStep,
    setRepoConfigStep,
    repoUrlDraft,
    setRepoUrlDraft,
    showRepoAdvanced,
    setShowRepoAdvanced,
    requireRemoteForProduction,
    setRequireRemoteForProduction,
    requireRemoteForStaging,
    setRequireRemoteForStaging,
    repoHealth,
    repoConfigBusy,
    repoValidationBusy,
    repoValidationError,
    repoConfigNotice,
    repoMigrationPlan,
    repoUrlValid,
    repoLastCheckedText,
    canMoveToNextStep,
    handleRefreshRepositoryStatus,
    handleAdvanceRepositoryStep,
    handleConnectRepository,
    handleSaveRepositoryPolicy
  };
}
