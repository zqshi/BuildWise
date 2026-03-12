export type WorkspaceView = "dashboard" | "projects" | "permissions";

export type MainPanelState = {
  activeView: WorkspaceView;
  showOpenclawWorkspace: boolean;
};

export function resolveSidebarViewState(nextView: WorkspaceView): MainPanelState {
  return {
    activeView: nextView,
    showOpenclawWorkspace: false
  };
}
