import { useAppController } from "./app/useAppController";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardView } from "./pages/dashboard/DashboardView";
import { DockSidebar } from "./pages/layout/DockSidebar";
import { CreateIterationModal } from "./pages/projects/CreateIterationModal";
import { CreateProjectModal } from "./pages/projects/CreateProjectModal";
import { ProjectsWorkspace } from "./pages/projects/ProjectsWorkspace";
import model from "../model.json";

export default function App() {
  const controller = useAppController();
  const backendOffline =
    controller.status?.status === "offline" ||
    (controller.error ? controller.error.includes("后端服务不可用") : false);

  if (controller.route === "login" || !controller.isAuthenticated) {
    return (
      <LoginPage
        loginAccount={controller.loginAccount}
        loginPassword={controller.loginPassword}
        showAccountError={controller.showAccountError}
        showPasswordError={controller.showPasswordError}
        accountError={controller.accountError}
        passwordError={controller.passwordError}
        accountRef={controller.loginAccountRef}
        passwordRef={controller.loginPasswordRef}
        onSubmit={controller.handleLogin}
        onAccountChange={controller.setLoginAccount}
        onPasswordChange={controller.setLoginPassword}
        onAccountBlur={() => controller.setLoginTouched((prev) => ({ ...prev, account: true }))}
        onPasswordBlur={() => controller.setLoginTouched((prev) => ({ ...prev, password: true }))}
      />
    );
  }

  return (
    <div className="workspace">
      <DockSidebar
        activeView={controller.activeView}
        dockUserLabel={controller.dockUserLabel}
        dockUserAvatar={controller.dockUserAvatar}
        showUserMenu={controller.showUserMenu}
        userMenuRef={controller.userMenuRef}
        onShowDashboard={() => controller.setActiveView("dashboard")}
        onShowProjects={() => controller.setActiveView("projects")}
        onToggleUserMenu={() => controller.setShowUserMenu((prev) => !prev)}
        onLogout={controller.handleLogout}
      />

      <main className={`board ${controller.activeView === "dashboard" ? "dashboard-mode" : "projects-mode"}`}>
        {backendOffline ? (
          <section className="backend-offline-banner" role="status" aria-live="polite">
            后端未连接（127.0.0.1:5055）。请执行：`npm --prefix v2/backend run dev`
          </section>
        ) : null}
        {controller.activeView === "dashboard" ? (
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
            onViewProjects={() => controller.setActiveView("projects")}
            onSelectProject={controller.handleSelectProject}
          />
        ) : (
          <ProjectsWorkspace
            projects={controller.projects}
            currentProjectId={controller.currentProjectId}
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
            chatInput={controller.chatInput}
            fileInputRef={controller.fileInputRef}
            analysisReport={controller.analysisReport}
            showAnalysisPanel={controller.showAnalysisPanel}
            isAnalyzingAttachment={controller.isAnalyzingAttachment}
            uploadAnalysisProgress={controller.uploadAnalysisProgress}
            onShowCreateProject={() => controller.setShowCreateProject(true)}
            onShowCreateIteration={() => controller.setShowCreateIteration(true)}
            onDeleteProject={controller.handleDeleteProject}
            onUploadClick={controller.handleUploadClick}
            onOpenAnalysisPanel={() => controller.setShowAnalysisPanel(true)}
            onCloseAnalysisPanel={() => controller.setShowAnalysisPanel(false)}
            onSelectProject={controller.handleSelectProject}
            onEnterIteration={controller.handleEnterIteration}
            onSwitchToProjectPanel={() => controller.setProjectPanelMode("project")}
            onUpload={controller.handleUpload}
            onUploadFiles={controller.uploadFiles}
            onChatInputChange={controller.setChatInput}
            onChatSend={controller.handleSend}
            onUpdateClarificationDraft={controller.handleUpdateClarificationDraft}
            onConfirmIterationAnalysis={controller.handleConfirmIterationAnalysis}
            onUpdateIterationBoundary={controller.handleUpdateIterationBoundary}
            onUpdateTestMatrixExecution={controller.handleUpdateTestMatrixExecution}
            onGenerateTestArtifacts={controller.handleGenerateTestArtifacts}
            onRefreshReleaseReview={controller.handleRefreshReleaseReview}
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
