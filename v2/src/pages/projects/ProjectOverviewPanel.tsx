import { useMemo, useState, type CSSProperties } from "react";
import type { Iteration, Project } from "../../domain/workspace/types";
import type { OpsMetricsPayload } from "../../domain/workspace/platformTypes";
import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import type { StatusPayload } from "../../domain/workspace/types";
import { ProjectOverviewPanelModelDetails } from "./ProjectOverviewPanelModelDetails";
import { ProjectOverviewPanelDrawers } from "./ProjectOverviewPanelDrawers";
import { BacklogPanel } from "./BacklogPanel";
import { KnowledgeWorkspaceView } from "./KnowledgeWorkspaceView";
import { useRepositoryConfig } from "./useRepositoryConfig";
import { useProjectModelView } from "./useProjectModelView";
import { usePolicyManagement } from "./usePolicyManagement";
import { useAssistantChat } from "./useAssistantChat";
import { useGovernanceEntry } from "./useGovernanceEntry";

type ProjectOverviewPanelProps = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  iterations: Iteration[];
  projectProgress: number;
  modelPageCount?: number;
  modelRuleCount?: number;
  modelEntityCount?: number;
  modelRelations?: ModelRelationPayload[];
  opsMetrics?: OpsMetricsPayload | null;
  status: StatusPayload | null;
  error: string | null;
  backendUnavailable?: boolean;
  onShowCreateIteration: () => void;
  onEnterIteration: (iterationId: number) => void;
  onDeleteIteration: (iterationId: number) => Promise<void>;
  onDeleteProject: (projectId: number) => Promise<void>;
};


export function ProjectOverviewPanel({
  currentProject,
  currentIteration,
  currentRole,
  iterations,
  projectProgress,
  modelPageCount = 0,
  modelRuleCount = 0,
  modelEntityCount = 0,
  modelRelations = [],
  opsMetrics: _opsMetrics = null,
  status,
  error: _error,
  backendUnavailable = false,
  onShowCreateIteration,
  onEnterIteration,
  onDeleteIteration,
  onDeleteProject
}: ProjectOverviewPanelProps) {
  const sortedIterations = useMemo(() => [...iterations].sort((a, b) => a.id - b.id), [iterations]);
  const recentIterations = useMemo(() => sortedIterations.slice(-5), [sortedIterations]);
  const completedIterations = sortedIterations.filter((item) => item.status === "completed").length;
  const activeIterations = sortedIterations.length - completedIterations;

  const isAdmin = currentRole === "owner";
  const targetIterationId = currentIteration?.id || iterations[iterations.length - 1]?.id || null;

  // Drawer visibility states lifted here to break circular dependency between hooks
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false);
  const [showAssistantDrawer, setShowAssistantDrawer] = useState(false);
  const [panelView, setPanelView] = useState<"overview" | "knowledge">("overview");

  // Hook 1: Repository config
  const repo = useRepositoryConfig(currentProject);

  // Hook 2: Project model view
  const model = useProjectModelView({
    currentProject,
    currentIteration,
    modelPageCount,
    modelRuleCount,
    modelEntityCount,
    modelRelations,
    projectProgress,
    repoHealth: repo.repoHealth,
    status,
    recentIterations
  });

  // Hook 3: Policy management
  const policy = usePolicyManagement({
    currentProject,
    isAdmin,
    targetIterationId,
    showPolicyDrawer,
    showAssistantDrawer
  });

  // Hook 4: Assistant chat (depends on loadPolicyData from policy hook)
  const assistant = useAssistantChat({
    currentProject,
    loadPolicyData: policy.loadPolicyData
  });

  // Hook 5: Governance entry (dispatches drawer opens)
  useGovernanceEntry({
    currentProjectId: currentProject?.id,
    setShowPolicyDrawer,
    setShowAssistantDrawer
  });

  const handleDeleteProject = async () => {
    if (!currentProject) {
      return;
    }
    const confirmed = window.confirm(`确认删除项目「${currentProject.name}」吗？删除后将从项目列表隐藏。`);
    if (!confirmed) {
      return;
    }
    await onDeleteProject(currentProject.id);
  };

  return (
    <>
      <article className="panel preview-panel context-panel project-overview-panel">
      <div className="panel-head">
        <div className="panel-view-tabs" role="tablist" aria-label="项目面板视图切换">
          <button type="button" role="tab" className={`btn ghost mini ${panelView === "overview" ? "active" : ""}`} aria-selected={panelView === "overview"} onClick={() => setPanelView("overview")}>项目总览</button>
          <button type="button" role="tab" className={`btn ghost mini ${panelView === "knowledge" ? "active" : ""}`} aria-selected={panelView === "knowledge"} onClick={() => setPanelView("knowledge")}>知识库</button>
        </div>
      </div>
      {panelView === "overview" ? (
      <div className="preview-scroll project-overview-scroll">
        <section className="project-overview-hero">
          <article className="project-progress-card">
            <div className="project-card-head">
              <h3>当前迭代进度</h3>
              <span className={`status-pill ${currentIteration?.status || "planned"}`}>{currentIteration?.status || "planned"}</span>
            </div>
            <div className="project-progress-ring" style={{ "--progress": `${Math.max(0, Math.min(100, projectProgress))}%` } as CSSProperties}>
              <div className="project-progress-ring-inner">
                <strong>{projectProgress}%</strong>
                <span>{currentIteration?.version || currentIteration?.name || "未选择迭代"}</span>
              </div>
            </div>
            <p className="project-progress-meta">
              总迭代 {iterations.length}（已完成 {completedIterations} / 进行中 {activeIterations}）
            </p>
          </article>

          <article className="project-summary-card">
            <div className="project-card-head">
              <h3>建模摘要</h3>
              <span className="linkish">健康分 {model.healthScore}</span>
            </div>
            <p className="project-summary-text">{model.summaryHeadline}</p>
            <div className="project-summary-kpis">
              <div className="doc-item">
                <span>领域规则</span>
                <strong>{model.displayedModelRuleCount}</strong>
              </div>
              <div className="doc-item">
                <span>数据实体</span>
                <strong>{model.displayedModelEntityCount}</strong>
              </div>
              <div className="doc-item">
                <span>实体关系</span>
                <strong>{model.displayedModelRelations.length}</strong>
              </div>
              <div className="doc-item">
                <span>页面资产</span>
                <strong>{model.displayedModelPageCount}</strong>
              </div>
            </div>
            {model.summaryHighlights.length > 0 ? (
              <ul className="project-highlight-list">
                {model.summaryHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="hint">当前项目已形成基础建模沉淀。</p>
            )}
          </article>
        </section>

        <BacklogPanel projectId={currentProject?.id ?? null} iterations={iterations} />

        <section className="project-versions-card">
          <div className="panel-head tight">
            <h3>版本记录</h3>
            <div className="chat-tools">
              <button type="button" className="icon-btn" title="筛选（即将上线）" disabled>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 3h11M5 7.5h6M6.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button type="button" className="icon-btn" title="导出（即将上线）" disabled>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2.5v7M5.5 7 8 9.5 10.5 7M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="btn ghost mini"
                onClick={onShowCreateIteration}
                disabled={!currentProject || backendUnavailable}
                title={backendUnavailable ? "后端服务未连接，暂不可创建迭代" : undefined}
              >
                新增迭代
              </button>
            </div>
          </div>
          {iterations.length === 0 ? (
            <p className="hint">暂无迭代版本</p>
          ) : (
            <div className="project-version-table" role="table" aria-label="迭代版本列表">
              <div className="project-version-head" role="row">
                <span>版本</span>
                <span>描述</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {iterations.map((item) => (
                <div key={item.id} className={`project-version-row ${item.id === currentIteration?.id ? "active" : ""}`} role="row">
                  <span className="project-version-name">{item.version || item.name}</span>
                  <span className="project-version-desc">{item.description || "暂无描述"}</span>
                  <span className="project-version-status">{item.status} · {item.progress}%</span>
                  <span>
                    <button type="button" className="btn ghost mini" onClick={() => onEnterIteration(item.id)}>
                      进入版本
                    </button>
                    <button
                      type="button"
                      className="btn ghost mini"
                      style={{ color: "var(--red-600, #dc2626)" }}
                      onClick={async () => {
                        const confirmed = window.confirm(`确认删除版本「${item.version || item.name}」？删除后不可恢复。`);
                        if (confirmed) await onDeleteIteration(item.id);
                      }}
                    >
                      删除
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <ProjectOverviewPanelModelDetails
          showModelDetails={model.showModelDetails}
          setShowModelDetails={model.setShowModelDetails}
          isUsingMockData={model.isUsingMockData}
          setBusinessSummaryVersion={model.setBusinessSummaryVersion}
          businessSummaryLoading={false}
          modelDetailsView={model.modelDetailsView}
          setModelDetailsView={model.setModelDetailsView}
          relationTypeFilter={model.relationTypeFilter}
          setRelationTypeFilter={model.setRelationTypeFilter}
          relationTypeStats={model.relationTypeStats}
          relationFocusEntities={model.relationFocusEntities}
          businessSummary={model.businessSummary}
          summaryGeneratedAtText={model.summaryGeneratedAtText}
          businessSummaryError=""
          domainRuleDescriptions={model.domainRuleDescriptions}
          relationGraph={model.relationGraph}
          relationGraphNodeById={model.relationGraphNodeById}
          filteredRelationGraphEdges={model.filteredRelationGraphEdges}
          highlightedEdgeId={model.highlightedEdgeId}
          setHighlightedEdgeId={model.setHighlightedEdgeId}
          activeFocusNodeId={model.activeFocusNodeId}
          hoveredConnectedNodeIds={model.hoveredConnectedNodeIds}
          selectedNodeId={model.selectedNodeId}
          setSelectedNodeId={model.setSelectedNodeId}
          setHoveredNodeId={model.setHoveredNodeId}
          graphViewportOffset={model.graphViewportOffset}
          showNodeLabels={model.showNodeLabels}
          centerGraphOnPoint={model.centerGraphOnPoint}
          highlightedEdge={model.highlightedEdge}
          hoveredNodeId={model.hoveredNodeId}
          selectedNode={model.selectedNode}
          selectedNodeOutgoingEdges={model.selectedNodeOutgoingEdges}
          selectedNodeIncomingEdges={model.selectedNodeIncomingEdges}
          entityCards={model.entityCards}
          ruleMappings={model.ruleMappings}
          relationNarratives={model.relationNarratives}
          displayedModelEntityCount={model.displayedModelEntityCount}
          displayedModelRelations={model.displayedModelRelations}
          displayedModelRuleCount={model.displayedModelRuleCount}
          unifiedGraph={model.unifiedGraph}
          knowledgeGenerating={model.knowledgeGraph.generating}
          onGenerateKnowledgeGraph={model.knowledgeGraph.generate}
        />
        <div className="info-box">
          <div className="panel-head tight">
            <h3>代码仓设置</h3>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" disabled={!currentProject} onClick={() => repo.setShowRepoConfigDrawer(true)}>
                打开设置面板
              </button>
            </div>
          </div>
          <p className="hint">采用统一右侧滑入面板配置。业务人员只需填写一个 Git 仓库地址。</p>
          <p className="hint">
            地址已配置：{repo.repoHealth ? (repo.repoHealth.remoteConfigured ? "是" : "否") : "-"}；连接可用：
            {repo.repoHealth ? (repo.repoHealth.remoteReachable ? "是" : "否") : "-"}；同步状态：
            {repo.repoHealth ? (repo.repoHealth.remoteSynced ? "正常" : "待同步") : "-"}
          </p>
          {repo.repoConfigNotice ? <p className="hint">{repo.repoConfigNotice}</p> : null}
          {repo.repoValidationError ? <p className="error-inline">{repo.repoValidationError}</p> : null}
        </div>

        <div className="info-box project-delete-box">
          <h3>项目操作</h3>
          <p className="hint">删除项目将执行逻辑删除，删除后项目不会出现在列表区域。</p>
          <button type="button" className="btn ghost mini project-delete-btn" onClick={handleDeleteProject} disabled={!currentProject}>
            删除项目
          </button>
        </div>
      </div>
      ) : (
        <KnowledgeWorkspaceView projectId={currentProject?.id ?? null} />
      )}
      </article>

      <ProjectOverviewPanelDrawers
        showPolicyDrawer={showPolicyDrawer}
        setShowPolicyDrawer={setShowPolicyDrawer}
        showAssistantDrawer={showAssistantDrawer}
        setShowAssistantDrawer={setShowAssistantDrawer}
        showRepoConfigDrawer={repo.showRepoConfigDrawer}
        setShowRepoConfigDrawer={repo.setShowRepoConfigDrawer}
        activePolicy={policy.activePolicy}
        policyItems={policy.policyItems}
        isAdmin={isAdmin}
        policyBusy={policy.policyBusy}
        handleCreatePolicyDraft={policy.handleCreatePolicyDraft}
        handleActivateLatestDraft={policy.handleActivateLatestDraft}
        handleRestoreInitialPolicyMode={policy.handleRestoreInitialPolicyMode}
        handleRunPolicyStep={policy.handleRunPolicyStep}
        bindingProfile={policy.bindingProfile}
        setBindingProfile={policy.setBindingProfile}
        bindingAgentId={policy.bindingAgentId}
        setBindingAgentId={policy.setBindingAgentId}
        bindingWorkspacePath={policy.bindingWorkspacePath}
        setBindingWorkspacePath={policy.setBindingWorkspacePath}
        bindingRuntimeMode={policy.bindingRuntimeMode}
        setBindingRuntimeMode={policy.setBindingRuntimeMode}
        handleBindWorkspace={policy.handleBindWorkspace}
        newRoleUserId={policy.newRoleUserId}
        setNewRoleUserId={policy.setNewRoleUserId}
        newRoleValue={policy.newRoleValue}
        setNewRoleValue={policy.setNewRoleValue}
        handleAddRoleBinding={policy.handleAddRoleBinding}
        roleBindings={policy.roleBindings}
        handleRemoveRoleBinding={policy.handleRemoveRoleBinding}
        targetIterationId={targetIterationId}
        assistantChatLines={assistant.assistantChatLines}
        assistantDialogMode={assistant.assistantDialogMode}
        setAssistantDialogMode={assistant.setAssistantDialogMode}
        assistantChatInput={assistant.assistantChatInput}
        setAssistantChatInput={assistant.setAssistantChatInput}
        assistantChatBusy={assistant.assistantChatBusy}
        handleAssistantSend={assistant.handleAssistantSend}
        policyLogs={policy.policyLogs}
        repoConfigStep={repo.repoConfigStep}
        setRepoConfigStep={repo.setRepoConfigStep}
        repoUrlDraft={repo.repoUrlDraft}
        setRepoUrlDraft={repo.setRepoUrlDraft}
        currentProjectExists={Boolean(currentProject)}
        repoConfigBusy={repo.repoConfigBusy}
        repoValidationBusy={repo.repoValidationBusy}
        repoUrlValid={repo.repoUrlValid}
        repoValidationError={repo.repoValidationError}
        requireRemoteForProduction={repo.requireRemoteForProduction}
        setRequireRemoteForProduction={repo.setRequireRemoteForProduction}
        requireRemoteForStaging={repo.requireRemoteForStaging}
        setRequireRemoteForStaging={repo.setRequireRemoteForStaging}
        repoHealth={repo.repoHealth}
        repoLastCheckedText={repo.repoLastCheckedText}
        repoConfigNotice={repo.repoConfigNotice}
        showRepoAdvanced={repo.showRepoAdvanced}
        setShowRepoAdvanced={repo.setShowRepoAdvanced}
        repoMigrationPlan={repo.repoMigrationPlan}
        canMoveToNextStep={repo.canMoveToNextStep}
        handleAdvanceRepositoryStep={repo.handleAdvanceRepositoryStep}
        handleSaveRepositoryPolicy={repo.handleSaveRepositoryPolicy}
        handleRefreshRepositoryStatus={repo.handleRefreshRepositoryStatus}
        handleConnectRepository={repo.handleConnectRepository}
      />
    </>
  );
}
