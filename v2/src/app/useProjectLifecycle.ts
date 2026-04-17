import { useEffect, useRef } from "react";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import type { useWorkspaceState } from "./useWorkspaceState";
import type { useWorkspaceLoaders } from "./useWorkspaceLoaders";
import type { useWorkspaceDerived } from "./useWorkspaceDerived";

type ProjectLifecycleParams = {
  isAuthenticated: boolean;
  currentTenantId: string;
  state: ReturnType<typeof useWorkspaceState>;
  loaders: ReturnType<typeof useWorkspaceLoaders>;
  derived: ReturnType<typeof useWorkspaceDerived>;
  loadProjectsWithSessionRecovery: () => Promise<unknown>;
};

/**
 * 项目生命周期：空项目重试 + 项目切换加载 + 视图自动加载。
 */
export function useProjectLifecycle({
  isAuthenticated,
  currentTenantId,
  state,
  loaders,
  derived,
  loadProjectsWithSessionRecovery,
}: ProjectLifecycleParams): void {
  useEmptyProjectRetry(isAuthenticated, currentTenantId, state, loadProjectsWithSessionRecovery);
  useProjectSwitchLoader(state, loaders, derived);
  useViewAutoLoad(state, loaders, loadProjectsWithSessionRecovery);
}

/** 项目列表为空时自动重试加载（最多3次） */
function useEmptyProjectRetry(
  isAuthenticated: boolean,
  currentTenantId: string,
  state: ProjectLifecycleParams["state"],
  loadProjectsWithSessionRecovery: () => Promise<unknown>,
): void {
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [isAuthenticated, currentTenantId]);

  useEffect(() => {
    if (!isAuthenticated || state.projects.length > 0 || !state.projectsHydrated) {
      clearTimer(retryTimerRef);
      return;
    }
    if (state.status?.status === "offline" || retryCountRef.current >= 3) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      retryCountRef.current += 1;
      loadProjectsWithSessionRecovery().catch((err) => {
        const msg = resolveErrorMessage(err);
        if (!msg.includes("401")) state.setError(msg);
      });
    }, 1200);
    return () => clearTimer(retryTimerRef);
  }, [isAuthenticated, currentTenantId, loadProjectsWithSessionRecovery, state.projects.length, state.projectsHydrated, state.status?.status]);
}

function clearTimer(ref: React.RefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    (ref as React.MutableRefObject<number | null>).current = null;
  }
}

/** 项目切换时加载迭代列表、协作数据、平台运维数据 */
function useProjectSwitchLoader(
  state: ProjectLifecycleParams["state"],
  loaders: ProjectLifecycleParams["loaders"],
  derived: ProjectLifecycleParams["derived"],
): void {
  const platformOpsLoadedForRef = useRef<number | null>(null);
  const projectExistsInList =
    derived.currentProject !== null && derived.currentProject.id === state.currentProjectId;
  const prevProjectIdRef = useRef<number | null>(state.currentProjectId);

  useEffect(() => {
    const changed = prevProjectIdRef.current !== state.currentProjectId;
    prevProjectIdRef.current = state.currentProjectId;

    if (!state.currentProjectId) {
      resetProjectDependentState(state, changed);
      platformOpsLoadedForRef.current = null;
      return;
    }
    if (!projectExistsInList) {
      clearProjectSubState(state);
      return;
    }
    platformOpsLoadedForRef.current = state.currentProjectId;
    Promise.all([
      loaders.loadIterations(state.currentProjectId),
      loaders.loadCollaboration(state.currentProjectId),
      loaders.loadPlatformOps(state.currentProjectId),
    ]).catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [state.currentProjectId, projectExistsInList]);
}

function resetProjectDependentState(
  state: ProjectLifecycleParams["state"],
  projectChanged: boolean,
): void {
  state.setIterations([]);
  state.setCurrentIterationId(null);
  if (projectChanged) state.setProjectPanelMode("project");
  state.setVersionSnapshots([]);
  state.setProjectShares([]);
  state.setShareAccess(null);
}

function clearProjectSubState(state: ProjectLifecycleParams["state"]): void {
  state.setIterations([]);
  state.setCurrentIterationId(null);
  state.setVersionSnapshots([]);
  state.setProjectShares([]);
  state.setShareAccess(null);
  state.setError((prev) => (prev && /^API error: 404\b/.test(prev) ? null : prev));
}

/** 切换到 projects 视图时自动加载项目列表和平台运维数据 */
function useViewAutoLoad(
  state: ProjectLifecycleParams["state"],
  loaders: ProjectLifecycleParams["loaders"],
  loadProjectsWithSessionRecovery: () => Promise<unknown>,
): void {
  const platformOpsLoadedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.activeView !== "projects") return;
    if (state.projects.length > 0 || state.status?.status === "offline") return;
    loadProjectsWithSessionRecovery().catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [loadProjectsWithSessionRecovery, state.activeView, state.projects.length, state.status?.status]);

  useEffect(() => {
    if (state.activeView !== "projects") return;
    const pid = state.currentProjectId ?? -1;
    if (platformOpsLoadedForRef.current === pid) return;
    platformOpsLoadedForRef.current = pid;
    loaders.loadPlatformOps(state.currentProjectId ?? undefined).catch((err) => {
      const msg = resolveErrorMessage(err);
      if (!msg.includes("401")) state.setError(msg);
    });
  }, [state.activeView, state.currentProjectId]);
}
