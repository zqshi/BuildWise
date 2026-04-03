import { useEffect, useState } from "react";
import type { Project } from "../../domain/workspace/types";
import {
  activateProjectPolicy,
  bindProjectWorkspace,
  createProjectPolicyDraft,
  executePolicyStep,
  fetchIterationPolicyLogs,
  fetchProjectPolicies,
  fetchProjectRoleBindings,
  removeProjectRoleBinding,
  restoreProjectPolicyToInitialMode,
  upsertProjectRoleBinding,
  type PolicyExecutionLogPayload,
  type ProjectPolicyPayload,
  type ProjectRoleBindingPayload
} from "../../app/workspaceApi";

type UsePolicyManagementParams = {
  currentProject: Project | null;
  isAdmin: boolean;
  targetIterationId: number | null;
  showPolicyDrawer: boolean;
  showAssistantDrawer: boolean;
};

export function usePolicyManagement({
  currentProject,
  isAdmin,
  targetIterationId,
  showPolicyDrawer,
  showAssistantDrawer
}: UsePolicyManagementParams) {
  const [activePolicy, setActivePolicy] = useState<ProjectPolicyPayload | null>(null);
  const [policyItems, setPolicyItems] = useState<ProjectPolicyPayload[]>([]);
  const [roleBindings, setRoleBindings] = useState<ProjectRoleBindingPayload[]>([]);
  const [policyLogs, setPolicyLogs] = useState<PolicyExecutionLogPayload[]>([]);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [_policyNotice, setPolicyNotice] = useState("");
  const [bindingProfile, setBindingProfile] = useState("buildwise-local");
  const [bindingAgentId, setBindingAgentId] = useState("main");
  const [bindingWorkspacePath, setBindingWorkspacePath] = useState("~/.buildwise/workspace-local");
  const [bindingRuntimeMode, setBindingRuntimeMode] = useState<"native" | "bridge">("native");
  const [newRoleUserId, setNewRoleUserId] = useState("user-1");
  const [newRoleValue, setNewRoleValue] = useState<"admin" | "member" | "viewer">("member");

  const loadPolicyData = async () => {
    if (!currentProject) return;
    try {
      const [policies, roles] = await Promise.all([fetchProjectPolicies(currentProject.id), fetchProjectRoleBindings(currentProject.id)]);
      setActivePolicy(policies.active || null);
      setPolicyItems(policies.items || []);
      setRoleBindings(roles);
      if (targetIterationId) {
        const logs = await fetchIterationPolicyLogs(targetIterationId);
        setPolicyLogs(logs.slice(-20).reverse());
      } else {
        setPolicyLogs([]);
      }
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "策略数据加载失败");
    }
  };

  const handleCreatePolicyDraft = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await createProjectPolicyDraft(currentProject.id);
      await loadPolicyData();
      setPolicyNotice("已创建策略草案。");
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "创建策略草案失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleActivateLatestDraft = async () => {
    if (!currentProject || !isAdmin) return;
    const draft = policyItems.find((item) => item.status === "draft");
    if (!draft) {
      setPolicyNotice("没有可激活的草案。");
      return;
    }
    try {
      setPolicyBusy(true);
      await activateProjectPolicy(currentProject.id, draft.version);
      await loadPolicyData();
      setPolicyNotice(`策略 v${draft.version} 已激活。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "激活策略失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRestoreInitialPolicyMode = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      const restored = await restoreProjectPolicyToInitialMode(currentProject.id);
      await loadPolicyData();
      setPolicyNotice(`已恢复到初始化编排模式（v${restored.version}）。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "恢复初始化编排模式失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleBindWorkspace = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await bindProjectWorkspace(currentProject.id, {
        assistantProfile: bindingProfile.trim(),
        agentId: bindingAgentId.trim() || "main",
        workspacePath: bindingWorkspacePath.trim(),
        runtimeMode: bindingRuntimeMode,
        locked: true
      });
      setPolicyNotice("工作区绑定已更新。");
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "绑定工作区失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleAddRoleBinding = async () => {
    if (!currentProject || !isAdmin || !newRoleUserId.trim()) return;
    try {
      setPolicyBusy(true);
      await upsertProjectRoleBinding(currentProject.id, { userId: newRoleUserId.trim(), role: newRoleValue }, "owner");
      await loadPolicyData();
      setPolicyNotice(`已更新租户成员 ${newRoleUserId.trim()} 的访问角色。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "更新角色失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRemoveRoleBinding = async (userId: string) => {
    if (!currentProject || !isAdmin || !userId.trim()) return;
    try {
      setPolicyBusy(true);
      await removeProjectRoleBinding(currentProject.id, userId.trim(), "owner");
      await loadPolicyData();
      setPolicyNotice(`已移除租户成员 ${userId.trim()}。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "移除角色失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRunPolicyStep = async () => {
    if (!targetIterationId) {
      setPolicyNotice("当前项目暂无可执行迭代。");
      return;
    }
    try {
      setPolicyBusy(true);
      const result = await executePolicyStep(targetIterationId, {
        action: "admin-policy-check",
        message: "管理员发起策略执行检查"
      });
      await loadPolicyData();
      setPolicyNotice(result.ok ? "策略执行检查通过。" : `策略阻断：${result.gate.reason}`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "策略执行失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  // Load policy data when drawers open
  useEffect(() => {
    if (!showPolicyDrawer && !showAssistantDrawer) return;
    void loadPolicyData();
  }, [showPolicyDrawer, showAssistantDrawer, currentProject?.id, targetIterationId]);

  return {
    activePolicy,
    policyItems,
    roleBindings,
    policyLogs,
    policyBusy,
    _policyNotice,
    bindingProfile,
    setBindingProfile,
    bindingAgentId,
    setBindingAgentId,
    bindingWorkspacePath,
    setBindingWorkspacePath,
    bindingRuntimeMode,
    setBindingRuntimeMode,
    newRoleUserId,
    setNewRoleUserId,
    newRoleValue,
    setNewRoleValue,
    loadPolicyData,
    handleCreatePolicyDraft,
    handleActivateLatestDraft,
    handleRestoreInitialPolicyMode,
    handleBindWorkspace,
    handleAddRoleBinding,
    handleRemoveRoleBinding,
    handleRunPolicyStep
  };
}
