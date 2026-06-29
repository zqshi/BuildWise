/**
 * AuthenticatedWorkspace — 已认证用户的主工作区布局。
 *
 * 职责：渲染侧边栏 + 主内容区 + 模态弹窗，由 AppControllerContext 包裹。
 */
import { useState } from "react";
import type { AppControllerValue } from "../contexts/AppControllerContext";
import { AppControllerContext } from "../contexts/AppControllerContext";
import { resolveSidebarViewState } from "./assistantNavigation";
import { DockSidebar } from "../pages/layout/DockSidebar";
import { CreateProjectModal } from "../pages/projects/CreateProjectModal";
import { CreateIterationModal } from "../pages/projects/CreateIterationModal";
import { MainContentArea } from "./MainContentArea";

export function AuthenticatedWorkspace({ controller }: { controller: AppControllerValue }) {
  const backendOffline = controller.status?.status === "offline";
  const [showAssistantWorkspace, setShowAssistantWorkspace] = useState(false);

  const openViewFromSidebar = (nextView: "dashboard" | "projects" | "permissions") => {
    const next = resolveSidebarViewState(nextView);
    setShowAssistantWorkspace(next.showAssistantWorkspace);
    controller.setActiveView(next.activeView);
  };

  const jumpToGovernance = (entry: "policy" | "assistant") => {
    controller.setShowUserMenu(false);
    if (entry === "policy") {
      openViewFromSidebar("permissions");
      return;
    }
    setShowAssistantWorkspace(true);
  };

  return (
    <AppControllerContext.Provider value={controller}>
      <div className="workspace">
        <WorkspaceSidebar
          controller={controller}
          openViewFromSidebar={openViewFromSidebar}
          jumpToGovernance={jumpToGovernance}
        />
        <main className={resolveBoardClassName(controller.activeView)}>
          {backendOffline ? <OfflineBanner /> : null}
          <MainContentArea
            controller={controller}
            showAssistantWorkspace={showAssistantWorkspace}
            onCloseAssistantWorkspace={() => setShowAssistantWorkspace(false)}
            onViewProjects={() => openViewFromSidebar("projects")}
          />
        </main>
        <ProjectModals controller={controller} backendOffline={backendOffline} />
      </div>
    </AppControllerContext.Provider>
  );
}

/* ── 侧边栏适配 ── */

function WorkspaceSidebar({
  controller,
  openViewFromSidebar,
  jumpToGovernance,
}: {
  controller: AppControllerValue;
  openViewFromSidebar: (v: "dashboard" | "projects" | "permissions") => void;
  jumpToGovernance: (e: "policy" | "assistant") => void;
}) {
  return (
    <DockSidebar
      activeView={controller.activeView}
      currentRole={controller.currentRole}
      dockUserLabel={controller.dockUserLabel}
      dockUserAvatar={controller.dockUserAvatar}
      tenants={controller.tenants}
      currentTenantId={controller.currentTenantId}
      showUserMenu={controller.showUserMenu}
      userMenuRef={controller.userMenuRef}
      onShowDashboard={() => openViewFromSidebar("dashboard")}
      onShowProjects={() => openViewFromSidebar("projects")}
      onToggleUserMenu={() => controller.setShowUserMenu((prev) => !prev)}
      onOpenPolicyManager={() => jumpToGovernance("policy")}
      onOpenAssistantDialog={() => jumpToGovernance("assistant")}
      onSwitchTenant={(tenantId) => {
        controller.switchTenant(tenantId);
        controller.setShowUserMenu(false);
      }}
      onLogout={controller.handleLogout}
    />
  );
}

/* ── 后端离线横幅 ── */

function OfflineBanner() {
  return (
    <section className="backend-offline-banner" role="status" aria-live="polite">
      {import.meta.env.DEV
        ? "后端服务未启动。请执行：npm --prefix v2/backend run dev"
        : "服务连接中断，正在尝试重连…"}
    </section>
  );
}

/* ── 主内容区 className 解析 ── */

function resolveBoardClassName(activeView: string): string {
  const mode =
    activeView === "dashboard"
      ? "dashboard-mode"
      : activeView === "permissions"
        ? "permissions-mode"
        : "projects-mode";
  return `board ${mode}`;
}

/* ── 项目/迭代创建弹窗 ── */

function ProjectModals({
  controller,
  backendOffline,
}: {
  controller: AppControllerValue;
  backendOffline: boolean;
}) {
  return (
    <>
      <CreateProjectModal
        open={controller.showCreateProject}
        busy={controller.busy}
        backendUnavailable={backendOffline}
        projectName={controller.projectName}
        projectDesc={controller.projectDesc}
        targetPlatforms={controller.targetPlatforms}
        onTargetPlatformsChange={controller.setTargetPlatforms}
        errorMessage={controller.error}
        onClose={() => controller.setShowCreateProject(false)}
        onNameChange={controller.setProjectName}
        onDescChange={controller.setProjectDesc}
        onSubmit={controller.handleCreateProject}
      />
      <CreateIterationModal
        open={controller.showCreateIteration}
        busy={controller.busy}
        backendUnavailable={backendOffline}
        iterName={controller.iterName}
        iterDesc={controller.iterDesc}
        iterGoals={controller.iterGoals}
        iterInScope={controller.iterInScope}
        iterOutScope={controller.iterOutScope}
        iterAcceptance={controller.iterAcceptance}
        iterVersionType={controller.iterVersionType}
        onClose={() => controller.setShowCreateIteration(false)}
        onIterNameChange={controller.setIterName}
        onIterDescChange={controller.setIterDesc}
        onIterGoalsChange={controller.setIterGoals}
        onIterInScopeChange={controller.setIterInScope}
        onIterOutScopeChange={controller.setIterOutScope}
        onIterAcceptanceChange={controller.setIterAcceptance}
        onIterVersionTypeChange={controller.setIterVersionType}
        onSubmit={controller.handleCreateIteration}
      />
    </>
  );
}
