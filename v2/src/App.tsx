import { useState } from "react";
import { useAppController } from "./app/useAppController";
import { resolveSidebarViewState } from "./app/openclawNavigation";
import { ViewErrorBoundary } from "./components/ViewErrorBoundary";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardView } from "./pages/dashboard/DashboardView";
import { PermissionSettingsPage } from "./pages/governance/PermissionSettingsPage";
import { DockSidebar } from "./pages/layout/DockSidebar";
import { OpenclawWorkspacePanel } from "./pages/layout/OpenclawWorkspacePanel";
import { MarketingHomePage } from "./pages/marketing/MarketingHomePage";
import { CreateIterationModal } from "./pages/projects/CreateIterationModal";
import { CreateProjectModal } from "./pages/projects/CreateProjectModal";
import { ProjectsWorkspace } from "./pages/projects/ProjectsWorkspace";
import model from "../model.json";

export default function App() {
  const controller = useAppController();
  const backendOffline = controller.status?.status === "offline";
  const isMarketingRoute = controller.route === "marketing" || (!controller.isAuthenticated && controller.route !== "login");
  const [showOpenclawWorkspace, setShowOpenclawWorkspace] = useState(false);
  const openViewFromSidebar = (nextView: "dashboard" | "projects" | "permissions") => {
    const next = resolveSidebarViewState(nextView);
    setShowOpenclawWorkspace(next.showOpenclawWorkspace);
    controller.setActiveView(next.activeView);
  };
  const jumpToGovernance = (entry: "policy" | "openclaw") => {
    controller.setShowUserMenu(false);
    if (entry === "policy") {
      openViewFromSidebar("permissions");
      return;
    }
    setShowOpenclawWorkspace(true);
  };
  if (isMarketingRoute) {
    return (
      <MarketingHomePage
        isAuthenticated={controller.isAuthenticated}
        onPrimaryAction={() => {
          window.location.hash = controller.isAuthenticated ? "/dashboard" : "/login";
        }}
        onSecondaryAction={() => {
          if (controller.isAuthenticated) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          window.location.hash = "/login";
        }}
      />
    );
  }

  if (controller.route === "login" || !controller.isAuthenticated) {
    return (
      <LoginPage
        loginMode={controller.loginMode}
        loginPhone={controller.loginPhone}
        loginCode={controller.loginCode}
        showPhoneError={controller.showPhoneError}
        showCodeError={controller.showCodeError}
        phoneError={controller.phoneError}
        codeError={controller.codeError}
        loginError={controller.loginError}
        debugCodeHint={controller.debugCodeHint}
        sendingCode={controller.sendingCode}
        countdown={controller.countdown}
        phoneRef={controller.loginPhoneRef}
        codeRef={controller.loginCodeRef}
        onSubmit={controller.handleLogin}
        onSwitchMode={controller.setLoginMode}
        onRequestCode={controller.handleRequestCode}
        onPhoneChange={controller.setLoginPhone}
        onCodeChange={controller.setLoginCode}
        onPhoneBlur={() => controller.setLoginTouched((prev) => ({ ...prev, phone: true }))}
        onCodeBlur={() => controller.setLoginTouched((prev) => ({ ...prev, code: true }))}
      />
    );
  }

  return (
    <div className="workspace">
      <DockSidebar
        activeView={controller.activeView}
        currentRole={controller.currentRole}
        dockUserLabel={controller.dockUserLabel}
        dockUserAvatar={controller.dockUserAvatar}
        showUserMenu={controller.showUserMenu}
        userMenuRef={controller.userMenuRef}
        onShowDashboard={() => openViewFromSidebar("dashboard")}
        onShowProjects={() => openViewFromSidebar("projects")}
        onToggleUserMenu={() => controller.setShowUserMenu((prev) => !prev)}
        onOpenPolicyManager={() => jumpToGovernance("policy")}
        onOpenOpenclawDialog={() => jumpToGovernance("openclaw")}
        onLogout={controller.handleLogout}
      />

      <main
        className={`board ${
          controller.activeView === "dashboard"
            ? "dashboard-mode"
            : controller.activeView === "permissions"
              ? "permissions-mode"
              : "projects-mode"
        }`}
      >
        {backendOffline ? (
          <section className="backend-offline-banner" role="status" aria-live="polite">
            后端未连接（127.0.0.1:5055）。请执行：`npm --prefix v2/backend run dev`
          </section>
        ) : null}
        <ViewErrorBoundary
          viewKey={`${showOpenclawWorkspace ? "openclaw" : controller.activeView}:${controller.currentProjectId ?? "none"}:${controller.currentIterationId ?? "none"}`}
          viewLabel={showOpenclawWorkspace ? "OpenClaw 工作台" : controller.activeView === "dashboard" ? "仪表盘" : controller.activeView === "permissions" ? "权限设置" : "项目工作台"}
        >
          {showOpenclawWorkspace ? (
            <OpenclawWorkspacePanel
              isAdmin={controller.currentRole === "owner"}
              onBack={() => setShowOpenclawWorkspace(false)}
            />
          ) : controller.activeView === "dashboard" ? (
            <DashboardView
              projects={controller.projects}
              inProgressIterations={controller.inProgressIterations}
              completedIterations={controller.completedIterations}
              status={controller.status}
              progressBuckets={controller.progressBuckets}
              iterationCount={controller.iterations.length}
              monthlyTrend={controller.monthlyTrend}
              currentProjectId={controller.currentProjectId}
              currentProjectIterations={controller.iterations.length}
              onViewProjects={() => openViewFromSidebar("projects")}
            />
          ) : controller.activeView === "permissions" ? (
            <PermissionSettingsPage currentRole={controller.currentRole} />
          ) : (
            <ProjectsWorkspace
              projects={controller.projects}
              currentProjectId={controller.currentProjectId}
              currentRole={controller.currentRole}
              currentProject={controller.currentProject}
              currentIteration={controller.currentIteration}
              iterations={controller.iterations}
              projectPanelMode={controller.projectPanelMode}
              projectProgress={controller.projectProgress}
              modelPageCount={model.pages.length}
              modelRuleCount={model.rules.length}
              modelEntityCount={model.entities.length}
              modelRelations={controller.modelRelations}
              versionSnapshots={controller.versionSnapshots}
              templateRuns={controller.templateRuns}
              deployments={controller.deployments}
              opsMetrics={controller.opsMetrics}
              status={controller.status}
              error={controller.error}
              uploadedFile={controller.uploadedFile}
              contextData={controller.contextData}
              stateMachine={controller.stateMachine}
              chatMessages={controller.chatMessages}
              chatSendStatus={controller.chatSendStatus}
              chatInput={controller.chatInput}
              fileInputRef={controller.fileInputRef}
              analysisReport={controller.analysisReport}
              showAnalysisPanel={controller.showAnalysisPanel}
              isAnalyzingAttachment={controller.isAnalyzingAttachment}
              lastUploadFailed={controller.lastUploadFailed}
              uploadAnalysisProgress={controller.uploadAnalysisProgress}
              uploadToastMessage={controller.uploadToastMessage}
              onShowCreateProject={() => controller.setShowCreateProject(true)}
              onShowCreateIteration={() => controller.setShowCreateIteration(true)}
              onDeleteProject={controller.handleDeleteProject}
              onUploadClick={controller.handleUploadClick}
              onOpenAnalysisPanel={() => controller.setShowAnalysisPanel(true)}
              onCloseAnalysisPanel={() => controller.setShowAnalysisPanel(false)}
              onClearUploadToast={() => controller.setUploadToastMessage(null)}
              onSelectProject={controller.handleSelectProject}
              onEnterIteration={controller.handleEnterIteration}
              onSwitchToProjectPanel={() => {
                controller.setShowAnalysisPanel(false);
                controller.setProjectPanelMode("project");
              }}
              onUpload={controller.handleUpload}
              onUploadFiles={controller.uploadFiles}
              onRetryUpload={controller.handleRetryUpload}
              onChatInputChange={controller.setChatInput}
              onChatSend={controller.handleSend}
              onUpdateClarificationDraft={controller.handleUpdateClarificationDraft}
              onConfirmIterationAnalysis={controller.handleConfirmIterationAnalysis}
              onUpdateIterationBoundary={controller.handleUpdateIterationBoundary}
              onUpdateTestMatrixExecution={controller.handleUpdateTestMatrixExecution}
              onGenerateTestArtifacts={controller.handleGenerateTestArtifacts}
              onRefreshReleaseReview={controller.handleRefreshReleaseReview}
              onSaveArtifactDraft={controller.handleSaveArtifactDraft}
              onCommitArtifact={controller.handleCommitArtifact}
              onConfirmArtifact={controller.handleConfirmArtifact}
              onAppendArtifactToChat={controller.handleAppendArtifactToChat}
              onTransitionArtifactStage={controller.handleTransitionArtifactStage}
              onTransitionState={controller.handleTransitionState}
              onCreateDeployment={controller.handleCreateDeployment}
              onTransitionDeployment={controller.handleTransitionDeployment}
              onPatchUploadedHtmlPreview={(path, content) => {
                controller.setUploadedFile((prev) => {
                  if (!prev) {
                    return prev;
                  }
                  const nextPreviews = prev.htmlPreviews.map((item) =>
                    item.path === path
                      ? {
                          ...item,
                          content
                        }
                      : item
                  );
                  return {
                    ...prev,
                    htmlPreviews: nextPreviews
                  };
                });
              }}
            />
          )}
        </ViewErrorBoundary>
      </main>

      <CreateProjectModal
        open={controller.showCreateProject}
        busy={controller.busy}
        backendUnavailable={backendOffline}
        projectName={controller.projectName}
        projectDesc={controller.projectDesc}
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
    </div>
  );
}
