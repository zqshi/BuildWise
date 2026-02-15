import { useAppController } from "./app/useAppController";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardView } from "./pages/dashboard/DashboardView";
import { ModelOpsPanel } from "./pages/dashboard/ModelOpsPanel";
import { DockSidebar } from "./pages/layout/DockSidebar";
import { CreateIterationModal } from "./pages/projects/CreateIterationModal";
import { CreateProjectModal } from "./pages/projects/CreateProjectModal";
import { ProjectsWorkspace } from "./pages/projects/ProjectsWorkspace";
import model from "../model.json";

export default function App() {
  const controller = useAppController();

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
        {controller.activeView === "dashboard" ? (
          <DashboardView
            projects={controller.projects}
            inProgressIterations={controller.inProgressIterations}
            completedIterations={controller.completedIterations}
            modelAssetCount={model.entities.length + model.rules.length + model.pages.length}
            status={controller.status}
            progressBuckets={controller.progressBuckets}
            iterationCount={controller.iterations.length}
            monthlyTrend={controller.monthlyTrend}
            currentProjectId={controller.currentProjectId}
            currentProjectIterations={controller.iterations.length}
            modelOpsPanel={
              <ModelOpsPanel
                loading={controller.modelOpsLoading}
                modelSummary={controller.modelSummary}
                modelRelations={controller.modelRelations}
                ruleCompile={controller.ruleCompile}
                ruleBind={controller.ruleBind}
                syncReport={controller.syncReport}
                traceReport={controller.traceReport}
                roadmapReports={controller.roadmapReports}
                onCreateRelation={controller.handleCreateModelRelation}
                onDeleteRelation={controller.handleDeleteModelRelation}
                onRefresh={controller.loadModelOps}
              />
            }
            onViewProjects={() => controller.setActiveView("projects")}
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
            status={controller.status}
            error={controller.error}
            uploadedFile={controller.uploadedFile}
            contextData={controller.contextData}
            chatMessages={controller.chatMessages}
            chatInput={controller.chatInput}
            fileInputRef={controller.fileInputRef}
            analysisReport={controller.analysisReport}
            showAnalysisPanel={controller.showAnalysisPanel}
            isAnalyzingAttachment={controller.isAnalyzingAttachment}
            onShowCreateProject={() => controller.setShowCreateProject(true)}
            onShowCreateIteration={() => controller.setShowCreateIteration(true)}
            onUploadClick={controller.handleUploadClick}
            onOpenAnalysisPanel={() => controller.setShowAnalysisPanel(true)}
            onCloseAnalysisPanel={() => controller.setShowAnalysisPanel(false)}
            onSelectProject={controller.handleSelectProject}
            onEnterIteration={controller.handleEnterIteration}
            onSwitchToProjectPanel={() => controller.setProjectPanelMode("project")}
            onUpload={controller.handleUpload}
            onChatInputChange={controller.setChatInput}
            onChatSend={controller.handleSend}
          />
        )}
      </main>

      <CreateProjectModal
        open={controller.showCreateProject}
        busy={controller.busy}
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
        iterName={controller.iterName}
        iterDesc={controller.iterDesc}
        iterGoals={controller.iterGoals}
        iterInScope={controller.iterInScope}
        iterOutScope={controller.iterOutScope}
        iterAcceptance={controller.iterAcceptance}
        onClose={() => controller.setShowCreateIteration(false)}
        onIterNameChange={controller.setIterName}
        onIterDescChange={controller.setIterDesc}
        onIterGoalsChange={controller.setIterGoals}
        onIterInScopeChange={controller.setIterInScope}
        onIterOutScopeChange={controller.setIterOutScope}
        onIterAcceptanceChange={controller.setIterAcceptance}
        onSubmit={controller.handleCreateIteration}
      />
    </div>
  );
}
