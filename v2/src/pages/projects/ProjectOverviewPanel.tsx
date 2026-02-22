import { useEffect, useMemo, useState } from "react";
import type { Iteration, ModelRelationPayload, Project, StatusPayload } from "../../domain/workspace/types";
import type { OpsMetricsPayload } from "../../domain/workspace/platformTypes";
import {
  bootstrapProjectRepository,
  configureProjectRepositoryMode,
  fetchProjectRepositoryMigrationPlan,
  fetchProjectRepositoryStatus
} from "../../app/workspaceApi";

type ProjectOverviewPanelProps = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  iterations: Iteration[];
  projectProgress: number;
  modelPageCount: number;
  modelRuleCount: number;
  modelEntityCount: number;
  modelRelations?: ModelRelationPayload[];
  opsMetrics?: OpsMetricsPayload | null;
  status: StatusPayload | null;
  error: string | null;
  backendUnavailable?: boolean;
  onShowCreateIteration: () => void;
  onEnterIteration: (iterationId: number) => void;
  onDeleteProject: (projectId: number) => Promise<void>;
};

function toFriendlyName(raw: string) {
  return raw.replace(/^entity_/i, "").replace(/[_-]+/g, " ").trim() || raw;
}

function toFriendlyRelationType(type: string) {
  if (type === "one_to_many") return "一对多";
  if (type === "many_to_one") return "多对一";
  if (type === "one_to_one") return "一对一";
  if (type === "many_to_many") return "多对多";
  return type;
}

function inferProviderFromRepoUrl(url: string): "github" | "gitlab" | "gitea" | "bitbucket" | "custom" {
  const normalized = url.toLowerCase();
  if (normalized.includes("github.com")) return "github";
  if (normalized.includes("gitlab")) return "gitlab";
  if (normalized.includes("bitbucket")) return "bitbucket";
  if (normalized.includes("gitea")) return "gitea";
  return "custom";
}

function guessRepoName(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  const last = parts[parts.length - 1] || "";
  return last.replace(/\.git$/i, "").trim();
}

function looksLikeGitUrl(url: string) {
  const normalized = url.trim();
  if (!normalized) return false;
  return /^(https?:\/\/|ssh:\/\/|git@)/i.test(normalized);
}

export function ProjectOverviewPanel({
  currentProject,
  currentIteration,
  iterations,
  projectProgress,
  modelPageCount,
  modelRuleCount,
  modelEntityCount,
  modelRelations = [],
  opsMetrics = null,
  status,
  error,
  backendUnavailable = false,
  onShowCreateIteration,
  onEnterIteration,
  onDeleteProject
}: ProjectOverviewPanelProps) {
  const [showModelDetails, setShowModelDetails] = useState(false);
  const [useMockModelData, setUseMockModelData] = useState(false);
  const [showRepoConfigDrawer, setShowRepoConfigDrawer] = useState(false);
  const [repoConfigStep, setRepoConfigStep] = useState<1 | 2 | 3>(1);
  const [repoUrlDraft, setRepoUrlDraft] = useState(currentProject?.repository?.url || "");
  const [showRepoAdvanced, setShowRepoAdvanced] = useState(false);
  const [requireRemoteForProduction, setRequireRemoteForProduction] = useState(
    currentProject?.repository?.governance?.requireRemoteForProduction ?? true
  );
  const [requireRemoteForStaging, setRequireRemoteForStaging] = useState(
    currentProject?.repository?.governance?.requireRemoteForStaging ?? false
  );
  const [repoHealth, setRepoHealth] = useState<{
    remoteConfigured: boolean;
    remoteReachable: boolean;
    remoteSynced: boolean;
    lastCheckedAt: string;
    lastError: string;
  } | null>(null);
  const [repoConfigBusy, setRepoConfigBusy] = useState(false);
  const [repoConfigNotice, setRepoConfigNotice] = useState("");
  const [repoMigrationPlan, setRepoMigrationPlan] = useState<{
    currentMode: "external_git" | "managed_local" | "hybrid";
    targetMode: "hybrid" | "external_git";
    blockers: string[];
    nextAction: string;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      status: "pending" | "ready" | "done" | "blocked";
      action: string;
    }>;
  } | null>(null);

  useEffect(() => {
    setRepoUrlDraft(currentProject?.repository?.url || "");
    setRequireRemoteForProduction(currentProject?.repository?.governance?.requireRemoteForProduction ?? true);
    setRequireRemoteForStaging(currentProject?.repository?.governance?.requireRemoteForStaging ?? false);
    setRepoHealth(currentProject?.repository?.health || null);
    setRepoMigrationPlan(null);
    setRepoConfigNotice("");
  }, [currentProject?.id, currentProject?.repository?.url, currentProject?.repository?.governance?.requireRemoteForProduction, currentProject?.repository?.governance?.requireRemoteForStaging]);

  useEffect(() => {
    if (!showRepoConfigDrawer) return;
    setRepoConfigStep(1);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowRepoConfigDrawer(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRepoConfigDrawer]);
  const sortedIterations = useMemo(() => [...iterations].sort((a, b) => a.id - b.id), [iterations]);
  const recentIterations = useMemo(() => sortedIterations.slice(-5), [sortedIterations]);
  const completedIterations = sortedIterations.filter((item) => item.status === "completed").length;
  const activeIterations = sortedIterations.length - completedIterations;

  const findMetric = (name: string) => opsMetrics?.metrics.find((item) => item.name === name)?.value;
  const healthScore = Math.max(0, Math.min(100, Number(findMetric("project_governance_health_score") ?? 0) || 0));
  const trendText = useMemo(() => {
    if (recentIterations.length < 2) {
      return "样本不足，趋势待形成";
    }
    const first = recentIterations[0]?.progress ?? 0;
    const last = recentIterations[recentIterations.length - 1]?.progress ?? 0;
    if (last > first) {
      return "跨迭代沉淀趋势向好";
    }
    if (last < first) {
      return "跨迭代沉淀趋势放缓";
    }
    return "跨迭代沉淀趋势平稳";
  }, [recentIterations]);

  const mockModelRelations = useMemo<ModelRelationPayload[]>(
    () => [
      { id: "mock-9001", fromEntityId: "entity_project", toEntityId: "entity_iteration", type: "one_to_many" },
      { id: "mock-9002", fromEntityId: "entity_iteration", toEntityId: "entity_requirement", type: "one_to_many" },
      { id: "mock-9003", fromEntityId: "entity_requirement", toEntityId: "entity_domain_rule", type: "many_to_many" },
      { id: "mock-9004", fromEntityId: "entity_domain_rule", toEntityId: "entity_data_entity", type: "many_to_many" },
      { id: "mock-9005", fromEntityId: "entity_data_entity", toEntityId: "entity_field_rule", type: "one_to_many" },
      { id: "mock-9006", fromEntityId: "entity_iteration", toEntityId: "entity_test_case", type: "one_to_many" },
      { id: "mock-9007", fromEntityId: "entity_release_gate", toEntityId: "entity_test_case", type: "one_to_many" },
      { id: "mock-9008", fromEntityId: "entity_release_gate", toEntityId: "entity_risk_item", type: "one_to_many" }
    ],
    []
  );
  const canAutoEnableMock = modelRelations.length === 0 || modelRuleCount === 0 || modelEntityCount === 0;
  const displayedModelRelations = useMockModelData || canAutoEnableMock ? mockModelRelations : modelRelations;
  const displayedModelRuleCount = useMockModelData || canAutoEnableMock ? Math.max(modelRuleCount, 18) : modelRuleCount;
  const displayedModelEntityCount = useMockModelData || canAutoEnableMock ? Math.max(modelEntityCount, 12) : modelEntityCount;
  const displayedModelPageCount = useMockModelData || canAutoEnableMock ? Math.max(modelPageCount, 9) : modelPageCount;
  const isUsingMockData = useMockModelData || canAutoEnableMock;
  const relationTypeStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const item of displayedModelRelations) {
      const key = toFriendlyRelationType(item.type);
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
    return Array.from(stats.entries()).map(([name, count]) => ({ name, count }));
  }, [displayedModelRelations]);
  const modelSummaryText = useMemo(() => {
    const relationBrief = relationTypeStats.length > 0 ? relationTypeStats.map((item) => `${item.name}${item.count}条`).join("，") : "暂无关系类型沉淀";
    return `当前已沉淀领域规则 ${displayedModelRuleCount} 条、数据实体 ${displayedModelEntityCount} 个、实体关系 ${displayedModelRelations.length} 条；关系结构以${relationBrief}为主。`;
  }, [displayedModelEntityCount, displayedModelRelations.length, displayedModelRuleCount, relationTypeStats]);
  const domainRuleDescriptions = useMemo(() => {
    const lines: string[] = [];
    for (const item of displayedModelRelations.slice(0, 8)) {
      const from = toFriendlyName(item.fromEntityId);
      const to = toFriendlyName(item.toEntityId);
      const relation = toFriendlyRelationType(item.type);
      lines.push(`规则：${from}与${to}之间建立${relation}约束。`);
    }
    return lines;
  }, [displayedModelRelations]);
  const modelHighlights = useMemo(() => {
    const issues: string[] = [];
    if (displayedModelEntityCount === 0) issues.push("尚未沉淀数据实体");
    if (displayedModelRuleCount === 0) issues.push("尚未沉淀领域规则");
    if (displayedModelRelations.length === 0) issues.push("尚未沉淀实体关系");
    return issues;
  }, [displayedModelEntityCount, displayedModelRuleCount, displayedModelRelations.length]);
  const repoUrlValid = looksLikeGitUrl(repoUrlDraft);
  const repoLastCheckedText = repoHealth?.lastCheckedAt ? new Date(repoHealth.lastCheckedAt).toLocaleString("zh-CN") : "";
  const canMoveToNextStep = repoConfigStep === 1 ? repoUrlValid : true;

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

  const handleRefreshRepositoryStatus = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      const status = await fetchProjectRepositoryStatus(currentProject.id);
      setRepoHealth(status?.health || null);
      setRequireRemoteForProduction(status?.governance?.requireRemoteForProduction ?? true);
      setRequireRemoteForStaging(status?.governance?.requireRemoteForStaging ?? false);
      const migrationPlan = await fetchProjectRepositoryMigrationPlan(currentProject.id);
      setRepoMigrationPlan(migrationPlan);
      setRepoConfigNotice("代码仓连接状态已刷新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓状态刷新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const handleConnectRepository = async () => {
    if (!currentProject) return;
    const url = repoUrlDraft.trim();
    if (!url) {
      setRepoConfigNotice("请先填写 Git 仓库地址。");
      return;
    }
    const repoName = guessRepoName(url) || currentProject.name;
    try {
      setRepoConfigBusy(true);
      await bootstrapProjectRepository(currentProject.id, {
        provider: inferProviderFromRepoUrl(url),
        name: repoName,
        url,
        defaultBranch: "main",
        repoMode: "external_git",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("代码仓地址已保存并完成连接。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓连接失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const handleSaveRepositoryPolicy = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      await configureProjectRepositoryMode(currentProject.id, {
        repoMode: repoUrlDraft.trim() ? "external_git" : "hybrid",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("发布前规则已更新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "发布前规则更新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  return (
    <>
      <article className="panel preview-panel context-panel project-overview-panel">
      <div className="panel-head">
        <h2>项目面板</h2>
      </div>
      <div className="preview-scroll">
        <div className="info-box">
          <h3>项目沉淀总览</h3>
          <p>项目：{currentProject?.name || "未选择项目"}</p>
          <p>{`总迭代 ${iterations.length}（已完成 ${completedIterations} / 进行中 ${activeIterations}）`}</p>
          <p>{`沉淀健康分：${healthScore}`}</p>
          <p>{trendText}</p>
          <div className="iteration-meta-grid">
            <div className="doc-item">领域规则沉淀：{displayedModelRuleCount}</div>
            <div className="doc-item">数据实体沉淀：{displayedModelEntityCount}</div>
            <div className="doc-item">实体关系沉淀：{displayedModelRelations.length}</div>
            <div className="doc-item">页面资产沉淀：{displayedModelPageCount}</div>
          </div>
          <div className="progress-bar">
            <div className="progress-value" style={{ width: `${projectProgress}%` }} />
          </div>
          {modelHighlights.length > 0 ? (
            <ul>
              {modelHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">当前项目已形成基础建模沉淀。</p>
          )}
        </div>

        <div className="info-box">
          <div className="panel-head tight">
            <h3>版本列表（迭代版本）</h3>
            <button
              className="btn ghost mini"
              onClick={onShowCreateIteration}
              disabled={!currentProject || backendUnavailable}
              title={backendUnavailable ? "后端服务未连接，暂不可创建迭代" : undefined}
            >
              新增迭代
            </button>
          </div>
          {iterations.length === 0 ? (
            <p className="hint">暂无迭代版本</p>
          ) : (
            <ul className="iteration-list">
              {iterations.map((item) => (
                <li key={item.id} className={item.id === currentIteration?.id ? "active" : ""}>
                  <button type="button" onClick={() => onEnterIteration(item.id)}>
                    <strong>{item.name}</strong>
                    <span>{`版本: ${item.version || "未生成"}`}</span>
                    <span>{item.description}</span>
                    <span>{`状态: ${item.status} · 进度: ${item.progress}%`}</span>
                    <span className="linkish">进入版本</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="info-box">
          <div className="panel-head tight">
            <h3>项目建模与领域建模</h3>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={() => setUseMockModelData((prev) => !prev)}>
                {isUsingMockData ? "切回真实数据" : "使用演示数据"}
              </button>
              <button type="button" className="btn ghost mini" onClick={() => setShowModelDetails((prev) => !prev)}>
                {showModelDetails ? "收起详情" : "查看详情"}
              </button>
            </div>
          </div>
          {isUsingMockData ? <p className="hint">当前展示为演示数据，用于预览完整建模呈现效果。</p> : null}
          <div className="iteration-meta-grid">
            <div className="doc-item">领域规则：{displayedModelRuleCount}</div>
            <div className="doc-item">数据实体：{displayedModelEntityCount}</div>
            <div className="doc-item">实体关系：{displayedModelRelations.length}</div>
          </div>
          {!showModelDetails ? (
            <p className="hint">点击“查看详情”可查看业务摘要与领域规则说明（可升级为大模型自动总结）。</p>
          ) : (
            <>
              <div className="info-box">
                <h3>建模业务摘要</h3>
                <p>{modelSummaryText}</p>
                <p className="hint">注：当前为结构化自动摘要。后续可接入大模型生成更贴近业务语义的总结。</p>
              </div>
              <div className="info-box">
                <h3>领域规则说明（沉淀清单）</h3>
                {domainRuleDescriptions.length === 0 ? (
                  <p className="hint">暂无可读规则说明。</p>
                ) : (
                  <ul>
                    {domainRuleDescriptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="info-box">
          <div className="panel-head tight">
            <h3>代码仓设置</h3>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" disabled={!currentProject} onClick={() => setShowRepoConfigDrawer(true)}>
                打开设置面板
              </button>
            </div>
          </div>
          <p className="hint">采用统一右侧滑入面板配置。业务人员只需填写一个 Git 仓库地址。</p>
          <p className="hint">
            地址已配置：{repoHealth ? (repoHealth.remoteConfigured ? "是" : "否") : "-"}；连接可用：
            {repoHealth ? (repoHealth.remoteReachable ? "是" : "否") : "-"}；同步状态：
            {repoHealth ? (repoHealth.remoteSynced ? "正常" : "待同步") : "-"}
          </p>
          {repoConfigNotice ? <p className="hint">{repoConfigNotice}</p> : null}
        </div>

        <div className="info-box">
          <h3>运行状态</h3>
          {status ? <p>{`服务：${status.service} · 状态：${status.status}`}</p> : <p className="hint">暂无服务状态。</p>}
          {error && <p className="error-inline">{error}</p>}
        </div>

        <div className="info-box project-delete-box">
          <h3>项目操作</h3>
          <p className="hint">删除项目将执行逻辑删除，删除后项目不会出现在列表区域。</p>
          <button type="button" className="btn ghost mini project-delete-btn" onClick={handleDeleteProject} disabled={!currentProject}>
            删除项目
          </button>
        </div>
      </div>
      </article>

      <div className={`analysis-drawer-mask ${showRepoConfigDrawer ? "open" : ""}`} onClick={() => setShowRepoConfigDrawer(false)} aria-hidden={!showRepoConfigDrawer} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showRepoConfigDrawer ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>代码仓设置（业务版）</h2>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={() => setShowRepoConfigDrawer(false)}>
                关闭
              </button>
            </div>
          </div>
          <div className="preview-scroll">
            <div className="repo-stepper">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`repo-step-item ${repoConfigStep === step ? "active" : ""} ${repoConfigStep > step ? "done" : ""}`}
                >
                  <span>{step}</span>
                  <em>{step === 1 ? "填写仓库地址" : step === 2 ? "设置发布规则" : "确认并连接"}</em>
                </div>
              ))}
            </div>

            {repoConfigStep === 1 ? (
              <div className="info-box">
                <h3>第一步：填写仓库地址</h3>
                <p className="hint">输入一个 Git 仓库地址，系统会自动识别平台。</p>
                <div className="repo-url-card">
                  <label className="repo-url-label">
                    <span>Git 仓库地址</span>
                    <span className="repo-url-label-tip">支持 `https://`、`ssh://`、`git@`</span>
                    <input
                      className="repo-url-input"
                      type="text"
                      value={repoUrlDraft}
                      onChange={(event) => setRepoUrlDraft(event.target.value)}
                      placeholder="例如：https://github.com/your-org/your-repo.git"
                      disabled={!currentProject || repoConfigBusy}
                    />
                  </label>
                  <p className="repo-url-example">
                    示例：`https://github.com/acme/buildwise.git` 或 `git@github.com:acme/buildwise.git`
                  </p>
                </div>
                {!repoUrlDraft.trim() ? <p className="hint">请先粘贴代码仓地址。</p> : null}
                {repoUrlDraft.trim() && !repoUrlValid ? <p className="error-inline">地址格式看起来不正确，请使用 https://、ssh:// 或 git@ 开头。</p> : null}
              </div>
            ) : null}

            {repoConfigStep === 2 ? (
              <div className="info-box">
                <h3>第二步：设置发布规则</h3>
                <p className="hint">确定哪些发布阶段必须先连上代码仓。</p>
                <div className="iteration-meta-grid">
                  <label className="doc-item">
                    <input
                      type="checkbox"
                      checked={requireRemoteForProduction}
                      onChange={(event) => setRequireRemoteForProduction(event.target.checked)}
                      disabled={!currentProject || repoConfigBusy}
                    />
                    正式发布前必须连接代码仓（推荐）
                  </label>
                  <label className="doc-item">
                    <input
                      type="checkbox"
                      checked={requireRemoteForStaging}
                      onChange={(event) => setRequireRemoteForStaging(event.target.checked)}
                      disabled={!currentProject || repoConfigBusy}
                    />
                    预发演示前必须连接代码仓
                  </label>
                </div>
              </div>
            ) : null}

            {repoConfigStep === 3 ? (
              <>
                <div className="info-box">
                  <h3>第三步：确认并连接</h3>
                  <p className="hint">确认地址与规则后，执行连接并检查状态。</p>
                  <div className="repo-status-grid">
                    <div className={`repo-status-card ${repoHealth?.remoteConfigured ? "is-ok" : "is-warn"}`}>
                      <p className="repo-status-label">地址已配置</p>
                      <strong>{repoHealth ? (repoHealth.remoteConfigured ? "已完成" : "未完成") : "-"}</strong>
                    </div>
                    <div className={`repo-status-card ${repoHealth?.remoteReachable ? "is-ok" : "is-warn"}`}>
                      <p className="repo-status-label">连接可用</p>
                      <strong>{repoHealth ? (repoHealth.remoteReachable ? "可连接" : "不可连接") : "-"}</strong>
                    </div>
                    <div className={`repo-status-card ${repoHealth?.remoteSynced ? "is-ok" : "is-warn"}`}>
                      <p className="repo-status-label">同步状态</p>
                      <strong>{repoHealth ? (repoHealth.remoteSynced ? "正常" : "待同步") : "-"}</strong>
                    </div>
                  </div>
                  {repoLastCheckedText ? <p className="hint">最近检查：{repoLastCheckedText}</p> : null}
                  {repoHealth?.lastError ? <p className="hint">最近连接提示：{repoHealth.lastError}</p> : null}
                  {repoConfigNotice ? <p className="hint">{repoConfigNotice}</p> : null}
                </div>

                <div className="info-box">
                  <div className="panel-head tight">
                    <h3>高级信息</h3>
                    <button type="button" className="btn ghost mini" onClick={() => setShowRepoAdvanced((prev) => !prev)}>
                      {showRepoAdvanced ? "隐藏" : "查看"}
                    </button>
                  </div>
                  {showRepoAdvanced && repoMigrationPlan ? (
                    <div className="info-box">
                      <h3>迁移建议（{repoMigrationPlan.currentMode} {"->"} {repoMigrationPlan.targetMode}）</h3>
                      <p className="hint">系统建议下一步：{repoMigrationPlan.nextAction}</p>
                      {repoMigrationPlan.blockers.length > 0 ? <p className="hint">当前阻碍项：{repoMigrationPlan.blockers.join("；")}</p> : null}
                      <ul className="history-list">
                        {repoMigrationPlan.steps.map((item) => (
                          <li key={item.id} className="history-item">
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                            <p className="hint">状态：{item.status.toUpperCase()} · 系统动作：{item.action}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="hint">高级信息默认收起，避免干扰业务操作。</p>
                  )}
                </div>
              </>
            ) : null}

            <div className="repo-config-actions">
              <button type="button" className="btn ghost mini" disabled={repoConfigStep === 1} onClick={() => setRepoConfigStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))}>
                上一步
              </button>
              {repoConfigStep < 3 ? (
                <button
                  type="button"
                  className="btn ghost mini"
                  disabled={!canMoveToNextStep}
                  onClick={() => setRepoConfigStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev))}
                >
                  下一步
                </button>
              ) : null}
              {repoConfigStep === 2 ? (
                <button type="button" className="btn ghost mini" disabled={!currentProject || repoConfigBusy} onClick={handleSaveRepositoryPolicy}>
                  保存发布前规则
                </button>
              ) : null}
              {repoConfigStep === 3 ? (
                <button type="button" className="btn ghost mini" disabled={!currentProject || repoConfigBusy} onClick={handleRefreshRepositoryStatus}>
                  刷新连接状态
                </button>
              ) : null}
              <button
                type="button"
                className="btn primary mini"
                disabled={!currentProject || repoConfigBusy || !repoUrlValid || repoConfigStep !== 3}
                onClick={handleConnectRepository}
              >
                保存并连接仓库
              </button>
            </div>
          </div>
        </article>
      </aside>
    </>
  );
}
