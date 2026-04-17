/**
 * MainContentArea — 主内容区视图切换。
 *
 * 职责：根据 activeView 和 showAssistantWorkspace 渲染对应视图，
 * 包含 ViewErrorBoundary 包裹和 Suspense 懒加载。
 */
import { Suspense, lazy } from "react";
import type { AppControllerValue } from "../contexts/AppControllerContext";
import { ViewErrorBoundary } from "../components/ViewErrorBoundary";
import { GlobalAssistantPanel } from "../pages/layout/GlobalAssistantPanel";
import { ProjectsWorkspaceConnector } from "./ProjectsWorkspaceConnector";

const DashboardView = lazy(() =>
  import("../pages/dashboard/DashboardView").then((m) => ({ default: m.DashboardView }))
);
const PermissionSettingsPage = lazy(() =>
  import("../pages/governance/PermissionSettingsPage").then((m) => ({ default: m.PermissionSettingsPage }))
);

type MainContentAreaProps = {
  controller: AppControllerValue;
  showAssistantWorkspace: boolean;
  onCloseAssistantWorkspace: () => void;
  onViewProjects: () => void;
};

export function MainContentArea({
  controller,
  showAssistantWorkspace,
  onCloseAssistantWorkspace,
  onViewProjects,
}: MainContentAreaProps) {
  const viewKey = `${showAssistantWorkspace ? "assistant" : controller.activeView}:${controller.currentProjectId ?? "none"}:${controller.currentIterationId ?? "none"}`;
  const viewLabel = resolveViewLabel(showAssistantWorkspace, controller.activeView);

  return (
    <ViewErrorBoundary viewKey={viewKey} viewLabel={viewLabel}>
      {showAssistantWorkspace ? (
        <GlobalAssistantPanel
          isAdmin={controller.currentRole === "owner"}
          onBack={onCloseAssistantWorkspace}
        />
      ) : controller.activeView === "dashboard" ? (
        <DashboardContent controller={controller} onViewProjects={onViewProjects} />
      ) : controller.activeView === "permissions" ? (
        <Suspense fallback={<div className="loading-spinner" />}>
          <PermissionSettingsPage currentRole={controller.currentRole} />
        </Suspense>
      ) : (
        <ProjectsWorkspaceConnector
          controller={controller}
          showAnalysisPanel={controller.showAnalysisPanel}
          onOpenAnalysisPanel={() => controller.setShowAnalysisPanel(true)}
          onCloseAnalysisPanel={() => controller.setShowAnalysisPanel(false)}
        />
      )}
    </ViewErrorBoundary>
  );
}

function DashboardContent({
  controller,
  onViewProjects,
}: {
  controller: AppControllerValue;
  onViewProjects: () => void;
}) {
  return (
    <Suspense fallback={<div className="loading-spinner" />}>
      <DashboardView
        projects={controller.projects}
        projectsHydrated={controller.projectsHydrated}
        inProgressIterations={controller.inProgressIterations}
        completedIterations={controller.completedIterations}
        status={controller.status}
        progressBuckets={controller.progressBuckets}
        iterationCount={controller.iterations.length}
        monthlyTrend={controller.monthlyTrend}
        currentProjectId={controller.currentProjectId}
        currentProjectIterations={controller.iterations.length}
        onViewProjects={onViewProjects}
      />
    </Suspense>
  );
}

function resolveViewLabel(
  showAssistant: boolean,
  activeView: string,
): string {
  if (showAssistant) return "业务助手工作台";
  if (activeView === "dashboard") return "仪表盘";
  if (activeView === "permissions") return "权限设置";
  return "项目工作台";
}
