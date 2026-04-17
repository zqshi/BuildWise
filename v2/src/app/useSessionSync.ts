import { useEffect, useRef } from "react";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import type { useAuthController } from "./useAuthController";
import type { useWorkspaceState } from "./useWorkspaceState";
import type { useWorkspaceDerived } from "./useWorkspaceDerived";

type SessionSyncParams = {
  auth: ReturnType<typeof useAuthController>;
  state: ReturnType<typeof useWorkspaceState>;
  derived: ReturnType<typeof useWorkspaceDerived>;
  loadProjectsWithSessionRecovery: () => Promise<unknown>;
};

/**
 * 同步认证状态到工作区：角色联动 + 租户切换重置。
 */
export function useSessionSync({
  auth,
  state,
  derived,
  loadProjectsWithSessionRecovery,
}: SessionSyncParams): void {
  useSyncRole(auth, state, derived);
  useTenantSwitchReset(auth, state, loadProjectsWithSessionRecovery);
}

/** 将项目级角色或工作区角色同步到 currentRole */
function useSyncRole(
  auth: SessionSyncParams["auth"],
  state: SessionSyncParams["state"],
  derived: SessionSyncParams["derived"],
): void {
  useEffect(() => {
    const projectScopedRole = derived.currentProject?.currentUserRole;
    state.setCurrentRole(projectScopedRole || auth.workspaceRole);
  }, [auth.workspaceRole, derived.currentProject?.currentUserRole, state.setCurrentRole]);
}

/** 租户切换时清空项目/迭代状态并重新加载 */
function useTenantSwitchReset(
  auth: SessionSyncParams["auth"],
  state: SessionSyncParams["state"],
  loadProjectsWithSessionRecovery: () => Promise<unknown>,
): void {
  const lastTenantRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      lastTenantRef.current = null;
      return;
    }
    const tenantKey = auth.currentTenantId || "";
    if (lastTenantRef.current === null && !tenantKey) {
      lastTenantRef.current = tenantKey;
      return;
    }
    if (lastTenantRef.current === tenantKey) return;
    lastTenantRef.current = tenantKey;
    resetWorkspaceState(state);
    loadProjectsWithSessionRecovery().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [auth.isAuthenticated, auth.currentTenantId, loadProjectsWithSessionRecovery]);
}

function resetWorkspaceState(state: SessionSyncParams["state"]): void {
  state.setProjects([]);
  state.setProjectsHydrated(false);
  state.setCurrentProjectId(null);
  state.setIterations([]);
  state.setCurrentIterationId(null);
  state.setProjectPanelMode("project");
  state.setVersionSnapshots([]);
  state.setProjectShares([]);
  state.setShareAccess(null);
}
