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

/* ── sub-hook: all 12 useState declarations ── */

function usePolicyState() {
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

  return {
    activePolicy, setActivePolicy,
    policyItems, setPolicyItems,
    roleBindings, setRoleBindings,
    policyLogs, setPolicyLogs,
    policyBusy, setPolicyBusy,
    _policyNotice, setPolicyNotice,
    bindingProfile, setBindingProfile,
    bindingAgentId, setBindingAgentId,
    bindingWorkspacePath, setBindingWorkspacePath,
    bindingRuntimeMode, setBindingRuntimeMode,
    newRoleUserId, setNewRoleUserId,
    newRoleValue, setNewRoleValue
  };
}

/* ── sub-hook params ── */

type PolicyHandlerParams = {
  state: ReturnType<typeof usePolicyState>;
  projectId: number | undefined;
  isAdmin: boolean;
  targetIterationId: number | null;
};

type PolicySetters = Pick<ReturnType<typeof usePolicyState>, "setActivePolicy" | "setPolicyItems" | "setRoleBindings" | "setPolicyLogs" | "setPolicyNotice">;

async function loadPolicyDataImpl(
  projectId: number | undefined, targetIterationId: number | null, s: PolicySetters
) {
  if (!projectId) return;
  try {
    const [policies, roles] = await Promise.all([fetchProjectPolicies(projectId), fetchProjectRoleBindings(projectId)]);
    s.setActivePolicy(policies.active || null);
    s.setPolicyItems(policies.items || []);
    s.setRoleBindings(roles);
    if (targetIterationId) {
      const logs = await fetchIterationPolicyLogs(targetIterationId);
      s.setPolicyLogs(logs.slice(-20).reverse());
    } else {
      s.setPolicyLogs([]);
    }
  } catch (error) {
    s.setPolicyNotice(error instanceof Error ? error.message : "策略数据加载失败");
  }
}

function usePolicyLifecycleHandlers(params: PolicyHandlerParams) {
  const { state, projectId, isAdmin, targetIterationId } = params;
  const { setPolicyBusy, setPolicyNotice, policyItems } = state;
  const setters: PolicySetters = state;

  const loadPolicyData = () => loadPolicyDataImpl(projectId, targetIterationId, setters);

  const handleCreatePolicyDraft = async () => {
    if (!projectId || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await createProjectPolicyDraft(projectId);
      await loadPolicyData();
      setPolicyNotice("已创建策略草案。");
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "创建策略草案失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleActivateLatestDraft = async () => {
    if (!projectId || !isAdmin) return;
    const draft = policyItems.find((item) => item.status === "draft");
    if (!draft) {
      setPolicyNotice("没有可激活的草案。");
      return;
    }
    try {
      setPolicyBusy(true);
      await activateProjectPolicy(projectId, draft.version);
      await loadPolicyData();
      setPolicyNotice(`策略 v${draft.version} 已激活。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "激活策略失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRestoreInitialPolicyMode = async () => {
    if (!projectId || !isAdmin) return;
    try {
      setPolicyBusy(true);
      const restored = await restoreProjectPolicyToInitialMode(projectId);
      await loadPolicyData();
      setPolicyNotice(`已恢复到初始化编排模式（v${restored.version}）。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "恢复初始化编排模式失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  return { loadPolicyData, handleCreatePolicyDraft, handleActivateLatestDraft, handleRestoreInitialPolicyMode };
}

/* ── sub-hook: access handlers (bind/role/execute) ── */

function usePolicyAccessHandlers(
  params: PolicyHandlerParams,
  loadPolicyData: () => Promise<void>
) {
  const { state, projectId, isAdmin, targetIterationId } = params;
  const { setPolicyBusy, setPolicyNotice, bindingProfile, bindingAgentId, bindingWorkspacePath, bindingRuntimeMode, newRoleUserId, newRoleValue } = state;

  const handleBindWorkspace = async () => {
    if (!projectId || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await bindProjectWorkspace(projectId, { assistantProfile: bindingProfile.trim(), agentId: bindingAgentId.trim() || "main", workspacePath: bindingWorkspacePath.trim(), runtimeMode: bindingRuntimeMode, locked: true });
      setPolicyNotice("工作区绑定已更新。");
    } catch (error) { setPolicyNotice(error instanceof Error ? error.message : "绑定工作区失败"); }
    finally { setPolicyBusy(false); }
  };

  const handleAddRoleBinding = async () => {
    if (!projectId || !isAdmin || !newRoleUserId.trim()) return;
    try {
      setPolicyBusy(true);
      await upsertProjectRoleBinding(projectId, { userId: newRoleUserId.trim(), role: newRoleValue }, "owner");
      await loadPolicyData();
      setPolicyNotice(`已更新租户成员 ${newRoleUserId.trim()} 的访问角色。`);
    } catch (error) { setPolicyNotice(error instanceof Error ? error.message : "更新角色失败"); }
    finally { setPolicyBusy(false); }
  };

  const handleRemoveRoleBinding = async (userId: string) => {
    if (!projectId || !isAdmin || !userId.trim()) return;
    try {
      setPolicyBusy(true);
      await removeProjectRoleBinding(projectId, userId.trim(), "owner");
      await loadPolicyData();
      setPolicyNotice(`已移除租户成员 ${userId.trim()}。`);
    } catch (error) { setPolicyNotice(error instanceof Error ? error.message : "移除角色失败"); }
    finally { setPolicyBusy(false); }
  };

  const handleRunPolicyStep = async () => {
    if (!targetIterationId) { setPolicyNotice("当前项目暂无可执行迭代。"); return; }
    try {
      setPolicyBusy(true);
      const result = await executePolicyStep(targetIterationId, { action: "admin-policy-check", message: "管理员发起策略执行检查" });
      await loadPolicyData();
      setPolicyNotice(result.ok ? "策略执行检查通过。" : `策略阻断：${result.gate.reason}`);
    } catch (error) { setPolicyNotice(error instanceof Error ? error.message : "策略执行失败"); }
    finally { setPolicyBusy(false); }
  };

  return { handleBindWorkspace, handleAddRoleBinding, handleRemoveRoleBinding, handleRunPolicyStep };
}

/* ── main hook: composition + effect + return ── */

export function usePolicyManagement({
  currentProject,
  isAdmin,
  targetIterationId,
  showPolicyDrawer,
  showAssistantDrawer
}: UsePolicyManagementParams) {
  const state = usePolicyState();
  const handlerParams: PolicyHandlerParams = {
    state,
    projectId: currentProject?.id,
    isAdmin,
    targetIterationId
  };
  const lifecycle = usePolicyLifecycleHandlers(handlerParams);
  const access = usePolicyAccessHandlers(handlerParams, lifecycle.loadPolicyData);

  // Load policy data when drawers open
  useEffect(() => {
    if (!showPolicyDrawer && !showAssistantDrawer) return;
    void lifecycle.loadPolicyData();
  }, [showPolicyDrawer, showAssistantDrawer, currentProject?.id, targetIterationId]);

  return {
    activePolicy: state.activePolicy,
    policyItems: state.policyItems,
    roleBindings: state.roleBindings,
    policyLogs: state.policyLogs,
    policyBusy: state.policyBusy,
    _policyNotice: state._policyNotice,
    bindingProfile: state.bindingProfile,
    setBindingProfile: state.setBindingProfile,
    bindingAgentId: state.bindingAgentId,
    setBindingAgentId: state.setBindingAgentId,
    bindingWorkspacePath: state.bindingWorkspacePath,
    setBindingWorkspacePath: state.setBindingWorkspacePath,
    bindingRuntimeMode: state.bindingRuntimeMode,
    setBindingRuntimeMode: state.setBindingRuntimeMode,
    newRoleUserId: state.newRoleUserId,
    setNewRoleUserId: state.setNewRoleUserId,
    newRoleValue: state.newRoleValue,
    setNewRoleValue: state.setNewRoleValue,
    ...lifecycle,
    ...access
  };
}
