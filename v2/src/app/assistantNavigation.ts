/**
 * Assistant navigation helpers.
 *
 * Resolves sidebar view selection into the active view + assistant panel state.
 */

type SidebarViewState = {
  activeView: "dashboard" | "projects" | "permissions";
  showAssistantWorkspace: boolean;
};

export function resolveSidebarViewState(
  nextView: "dashboard" | "projects" | "permissions"
): SidebarViewState {
  return {
    activeView: nextView,
    showAssistantWorkspace: false,
  };
}
