import { useMemo, useState } from "react";
import type { Iteration, ModelRelationPayload, Project, StatusPayload } from "../../domain/workspace/types";
import type { OpsMetricsPayload } from "../../domain/workspace/platformTypes";

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
  );
}
